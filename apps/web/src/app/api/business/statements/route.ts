import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
const isoDate=/^\d{4}-\d{2}-\d{2}$/;

export async function GET(request:Request){
  const url=new URL(request.url);const organisation=url.searchParams.get('organisation');const from=url.searchParams.get('from');const to=url.searchParams.get('to');
  if(!organisation)return NextResponse.json({error:'organisation is required'},{status:400});
  if((from&&!isoDate.test(from))||(to&&!isoDate.test(to))||(from&&to&&from>to))return NextResponse.json({error:'Invalid statement date range.'},{status:400});
  const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const [{data:membership},{data:org}]=await Promise.all([userDb.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle(),userDb.from('organisations').select('id,name,kind').eq('id',organisation).maybeSingle()]);if(!membership||!org||org.kind!=='business_client')return NextResponse.json({error:'Access denied.'},{status:403});
  try{const admin=getAdminSupabase();let jobsQuery=admin.from('jobs').select('id,created_at,completed_at,address,postcode,description,status,urgency,customer_total_pence,platform_fee_pence,po_reference,cost_centre,site_reference,corporate_sla_id,operational_risk_state').eq('business_organisation_id',organisation).order('created_at',{ascending:true});if(from)jobsQuery=jobsQuery.gte('created_at',`${from}T00:00:00.000Z`);if(to)jobsQuery=jobsQuery.lte('created_at',`${to}T23:59:59.999Z`);const {data:jobs}=await jobsQuery;
    let invoicesQuery=admin.from('corporate_invoice_runs').select('id,period_start,period_end,status,subtotal_pence,management_fee_pence,vat_pence,total_pence,stripe_invoice_status,hosted_invoice_url,invoice_pdf_url,issued_at,paid_at,exception_reason').eq('organisation_id',organisation).order('period_end',{ascending:true});if(from)invoicesQuery=invoicesQuery.gte('period_end',from);if(to)invoicesQuery=invoicesQuery.lte('period_start',to);const {data:invoiceRuns}=await invoicesQuery;
    const rows=['record_type,date,reference,address,postcode,description,status,urgency,job_spend_pence,platform_fee_pence,po_reference,cost_centre,site_reference,sla_id,risk_state,period_start,period_end,subtotal_pence,management_fee_pence,vat_pence,total_pence,stripe_invoice_status,issued_at,paid_at,invoice_url,pdf_url,exception_reason'];
    for(const job of jobs||[])rows.push(['job',job.created_at,job.id,job.address,job.postcode,job.description,job.status,job.urgency,job.customer_total_pence,job.platform_fee_pence,job.po_reference,job.cost_centre,job.site_reference,job.corporate_sla_id,job.operational_risk_state,'','','','','','','','','','','',''].map(esc).join(','));
    for(const run of invoiceRuns||[])rows.push(['invoice_run',run.issued_at||run.period_end,run.id,'','','',run.status,'','','','','','','','',run.period_start,run.period_end,run.subtotal_pence,run.management_fee_pence,run.vat_pence,run.total_pence,run.stripe_invoice_status,run.issued_at,run.paid_at,run.hosted_invoice_url,run.invoice_pdf_url,run.exception_reason].map(esc).join(','));
    const rangeSuffix=from||to?`-${from||'start'}-to-${to||'present'}`:'';return new NextResponse(rows.join('\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="corporate-spend-${organisation}${rangeSuffix}.csv"`,'cache-control':'no-store'}});
  }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Unable to generate corporate statement.'},{status:500})}
}
