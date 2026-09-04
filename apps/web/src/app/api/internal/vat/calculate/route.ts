import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const {data:periods,error}=await supabase.from('vat_periods').select('id,organisation_id,period_key,starts_on,ends_on,status').in('status',['open','ready']).order('ends_on',{ascending:true}).limit(25);
    if(error)return NextResponse.json({error:'Unable to load VAT periods.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const period of periods||[]){
      const {data:profile}=await supabase.from('accounting_profiles').select('vat_registered,vat_number,vat_scheme').eq('organisation_id',period.organisation_id).maybeSingle();
      if(!profile?.vat_registered){results.push({periodKey:period.period_key,status:'skipped',reason:'not_vat_registered'});continue}
      if(profile.vat_scheme!=='standard'){
        await supabase.from('finance_reconciliation_exceptions').upsert({organisation_id:period.organisation_id,source:'vat_period',source_id:period.id,exception_type:'unsupported_vat_scheme',currency:'GBP',details:{periodKey:period.period_key,vatScheme:profile.vat_scheme}},{onConflict:'source,source_id,exception_type'});
        results.push({periodKey:period.period_key,status:'exception',reason:`VAT scheme ${profile.vat_scheme} requires a dedicated calculation path.`});continue;
      }
      const [{data:invoices},{data:expenses}]=await Promise.all([
        supabase.from('invoices').select('document_type,net_pence,vat_pence,status,tax_point').eq('organisation_id',period.organisation_id).gte('tax_point',period.starts_on).lte('tax_point',period.ends_on).in('status',['issued','paid','part_paid','credited']),
        supabase.from('provider_expenses').select('net_pence,vat_pence,status,incurred_on').eq('organisation_id',period.organisation_id).gte('incurred_on',period.starts_on).lte('incurred_on',period.ends_on).in('status',['recorded','approved'])
      ]);
      let salesNet=0,outputVat=0;
      for(const invoice of invoices||[]){const sign=invoice.document_type==='credit_note'?-1:1;salesNet+=sign*Number(invoice.net_pence||0);outputVat+=sign*Number(invoice.vat_pence||0)}
      let purchasesNet=0,inputVat=0;
      for(const expense of expenses||[]){purchasesNet+=Number(expense.net_pence||0);inputVat+=Number(expense.vat_pence||0)}
      const box1=outputVat,box2=0,box3=box1+box2,box4=inputVat,box5=box3-box4,box6=salesNet,box7=purchasesNet,box8=0,box9=0;
      const now=new Date().toISOString();
      const {error:updateError}=await supabase.from('vat_periods').update({box_1_output_vat_pence:box1,box_2_acquisitions_vat_pence:box2,box_3_total_vat_pence:box3,box_4_reclaimed_vat_pence:box4,box_5_net_vat_pence:box5,box_6_sales_net_pence:box6,box_7_purchases_net_pence:box7,box_8_eu_supplies_net_pence:box8,box_9_eu_acquisitions_net_pence:box9,calculated_at:now,status:'ready'}).eq('id',period.id);
      if(updateError){results.push({periodKey:period.period_key,status:'error',error:updateError.message});continue}
      await supabase.from('audit_events').insert({event_type:'finance.vat_period_calculated',entity_type:'vat_period',entity_id:period.id,metadata:{organisationId:period.organisation_id,periodKey:period.period_key,box1,box2,box3,box4,box5,box6,box7,box8,box9,scheme:'standard'}});
      results.push({periodKey:period.period_key,status:'ready',boxes:{box1,box2,box3,box4,box5,box6,box7,box8,box9}});
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'VAT calculation worker failed.'},{status:500});
  }
}
