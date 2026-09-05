import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

function periodBounds(reference=new Date()){
  const start=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth()-1,1));
  const end=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth(),0));
  return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();const {start,end}=periodBounds();
    const {data:profiles,error}=await supabase.from('corporate_billing_profiles').select('organisation_id,billing_cycle,payment_terms_days,purchase_order_required,consolidated_billing,billing_email').eq('consolidated_billing',true).eq('billing_cycle','monthly');
    if(error)return NextResponse.json({error:'Unable to load billing profiles.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const profile of profiles||[]){
      const {data:jobs,error:jobError}=await supabase.from('jobs').select('id,customer_total_pence,platform_fee_pence,corporate_sla_id,po_reference,cost_centre,site_reference,status,completed_at').eq('business_organisation_id',profile.organisation_id).gte('completed_at',`${start}T00:00:00Z`).lte('completed_at',`${end}T23:59:59.999Z`).in('status',['completed','closed']);
      if(jobError){results.push({organisationId:profile.organisation_id,status:'exception',reason:'job_query_failed'});continue}
      const rows=jobs||[];
      if(profile.purchase_order_required&&rows.some(j=>!j.po_reference)){await supabase.from('corporate_invoice_runs').upsert({organisation_id:profile.organisation_id,period_start:start,period_end:end,status:'exception',exception_reason:'One or more completed jobs are missing required PO references.'},{onConflict:'organisation_id,period_start,period_end'});results.push({organisationId:profile.organisation_id,status:'exception',reason:'missing_po'});continue}
      const subtotal=rows.reduce((sum,j)=>sum+Number(j.customer_total_pence||0),0);
      const slaIds=[...new Set(rows.map(j=>j.corporate_sla_id).filter((id):id is string=>Boolean(id)))];
      const {data:slas}=slaIds.length?await supabase.from('corporate_slas').select('id,management_fee_pence').in('id',slaIds):{data:[]};
      const managementFee=(slas||[]).reduce((sum,s)=>sum+Number(s.management_fee_pence||0),0);
      const total=subtotal+managementFee;
      await supabase.from('corporate_invoice_runs').upsert({organisation_id:profile.organisation_id,period_start:start,period_end:end,status:rows.length?'ready':'draft',subtotal_pence:subtotal,management_fee_pence:managementFee,vat_pence:0,total_pence:total,exception_reason:null},{onConflict:'organisation_id,period_start,period_end'});
      results.push({organisationId:profile.organisation_id,status:rows.length?'ready':'draft',jobs:rows.length,totalPence:total});
    }
    return NextResponse.json({period:{start,end},processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Corporate billing worker failed.'},{status:500});
  }
}
