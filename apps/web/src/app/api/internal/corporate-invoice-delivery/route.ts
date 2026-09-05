import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { getStripeClient,StripeConfigurationError } from '@/lib/stripe';
import { internalRequestAuthorised } from '@/lib/internal';

const BATCH=10;
const LEGAL_FOOTER='National Electrician Hub and Raeburn Services are trading names of The Raeburn Holding Group Limited. Registered in England and Wales. Company No. 17361231.';

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const db=getAdminSupabase();const stripe=getStripeClient();
    const {data:runs,error}=await db.from('corporate_invoice_runs')
      .select('id,organisation_id,period_start,period_end,status,subtotal_pence,management_fee_pence,vat_pence,total_pence,stripe_invoice_id')
      .eq('status','ready').is('stripe_invoice_id',null).order('period_end',{ascending:true}).limit(BATCH);
    if(error)return NextResponse.json({error:'Unable to load corporate invoice queue.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const run of runs||[]){
      let stripeInvoiceId:string|null=null;
      try{
        const [{data:profile},{data:organisation},{data:jobs}]=await Promise.all([
          db.from('corporate_billing_profiles').select('stripe_customer_id,billing_email,payment_terms_days,invoice_metadata').eq('organisation_id',run.organisation_id).maybeSingle(),
          db.from('organisations').select('name,contact_email,company_number').eq('id',run.organisation_id).maybeSingle(),
          db.from('jobs').select('id,service_key,customer_total_pence,po_reference,cost_centre,site_reference,completed_at').eq('business_organisation_id',run.organisation_id).gte('completed_at',`${run.period_start}T00:00:00Z`).lte('completed_at',`${run.period_end}T23:59:59.999Z`).in('status',['completed','closed']).order('completed_at',{ascending:true})
        ]);
        if(!profile||!organisation)throw new Error('Corporate billing profile or organisation is missing.');
        const email=profile.billing_email||organisation.contact_email;if(!email)throw new Error('Corporate billing email is required before invoice delivery.');
        if(Number(run.vat_pence||0)!==0)throw new Error('Corporate Stripe invoice worker will not infer VAT. Non-zero VAT requires an explicitly validated tax calculation path.');
        const jobSubtotal=(jobs||[]).reduce((sum,j)=>sum+Number(j.customer_total_pence||0),0);
        if(jobSubtotal!==Number(run.subtotal_pence||0))throw new Error(`Invoice source mismatch: run subtotal ${run.subtotal_pence} differs from completed-job subtotal ${jobSubtotal}.`);
        const expectedTotal=jobSubtotal+Number(run.management_fee_pence||0)+Number(run.vat_pence||0);
        if(expectedTotal!==Number(run.total_pence||0))throw new Error('Invoice run total no longer matches its component amounts.');

        let customerId=profile.stripe_customer_id as string|null;
        if(!customerId){
          const customer=await stripe.customers.create({name:organisation.name,email,metadata:{organisation_id:run.organisation_id,company_number:organisation.company_number||''}},{idempotencyKey:`service-business:corporate-customer:${run.organisation_id}`});
          customerId=customer.id;
          await db.from('corporate_billing_profiles').update({stripe_customer_id:customerId,updated_at:new Date().toISOString()}).eq('organisation_id',run.organisation_id);
        }else{
          await stripe.customers.update(customerId,{name:organisation.name,email,metadata:{organisation_id:run.organisation_id,company_number:organisation.company_number||''}});
        }

        const invoice=await stripe.invoices.create({
          customer:customerId,
          collection_method:'send_invoice',
          days_until_due:Math.max(1,Math.min(90,Number(profile.payment_terms_days||30))),
          auto_advance:false,
          description:`National Electrician Hub consolidated services · ${run.period_start} to ${run.period_end}`,
          footer:LEGAL_FOOTER,
          metadata:{organisation_id:run.organisation_id,invoice_run_id:run.id,period_start:run.period_start,period_end:run.period_end,source:'service_business',...(profile.invoice_metadata||{})}
        },{idempotencyKey:`service-business:corporate-invoice:${run.id}`});
        stripeInvoiceId=invoice.id;
        await db.from('corporate_invoice_runs').update({stripe_invoice_id:invoice.id,stripe_invoice_status:invoice.status||'draft',stripe_updated_at:new Date().toISOString()}).eq('id',run.id);

        for(const job of jobs||[]){
          const amount=Number(job.customer_total_pence||0);if(amount<=0)continue;
          const refs=[job.po_reference&&`PO ${job.po_reference}`,job.cost_centre&&`Cost centre ${job.cost_centre}`,job.site_reference&&`Site ${job.site_reference}`].filter(Boolean).join(' · ');
          await stripe.invoiceItems.create({customer:customerId,invoice:invoice.id,amount,currency:'gbp',description:`${job.service_key||'Electrical services'} · Job ${String(job.id).slice(0,8).toUpperCase()}${refs?` · ${refs}`:''}`,metadata:{job_id:job.id,organisation_id:run.organisation_id}},{idempotencyKey:`service-business:corporate-invoice-item:${run.id}:${job.id}`});
        }
        const managementFee=Number(run.management_fee_pence||0);
        if(managementFee>0)await stripe.invoiceItems.create({customer:customerId,invoice:invoice.id,amount:managementFee,currency:'gbp',description:`Corporate service-level / management fee · ${run.period_start} to ${run.period_end}`,metadata:{invoice_run_id:run.id,organisation_id:run.organisation_id,component:'management_fee'}},{idempotencyKey:`service-business:corporate-management-fee:${run.id}`});

        const finalised=await stripe.invoices.finalizeInvoice(invoice.id,{auto_advance:false},{idempotencyKey:`service-business:corporate-finalize:${run.id}`});
        const sent=await stripe.invoices.sendInvoice(finalised.id,{},{idempotencyKey:`service-business:corporate-send:${run.id}`});
        const now=new Date().toISOString();
        await db.from('corporate_invoice_runs').update({status:'issued',stripe_invoice_id:sent.id,stripe_invoice_status:sent.status||'open',hosted_invoice_url:sent.hosted_invoice_url||null,invoice_pdf_url:sent.invoice_pdf||null,issued_at:now,stripe_updated_at:now,exception_reason:null}).eq('id',run.id);
        await db.from('audit_events').insert({event_type:'corporate.invoice_issued',entity_type:'corporate_invoice_run',entity_id:run.id,metadata:{organisationId:run.organisation_id,stripeInvoiceId:sent.id,totalPence:Number(run.total_pence),periodStart:run.period_start,periodEnd:run.period_end}});
        results.push({runId:run.id,status:'issued',stripeInvoiceId:sent.id,totalPence:Number(run.total_pence)});
      }catch(invoiceError){
        const message=invoiceError instanceof Error?invoiceError.message:'Corporate invoice delivery failed.';
        await db.from('corporate_invoice_runs').update({status:'exception',stripe_invoice_id:stripeInvoiceId,exception_reason:message,stripe_updated_at:new Date().toISOString()}).eq('id',run.id);
        results.push({runId:run.id,status:'exception',error:message,stripeInvoiceId});
      }
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Corporate invoicing infrastructure is not configured.'},{status:503});
    return NextResponse.json({error:'Corporate invoice delivery worker failed.'},{status:500});
  }
}
