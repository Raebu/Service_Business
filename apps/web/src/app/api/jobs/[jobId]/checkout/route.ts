import { NextResponse } from 'next/server';
import { z } from 'zod';
import { customerMayAccessJob } from '@/lib/job-access';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { getStripeClient,StripeConfigurationError,STRIPE_INTEGRATION_IDENTIFIER,transferGroupForJob } from '@/lib/stripe';

const schema=z.object({token:z.string().min(20).optional()});

export async function POST(request:Request,{params}:{params:Promise<{jobId:string}>}){
  const {jobId}=await params;
  const parsed=schema.safeParse(await request.json().catch(()=>({})));
  if(!parsed.success)return NextResponse.json({error:'Invalid checkout request.'},{status:400});
  try{
    if(!await customerMayAccessJob(jobId,parsed.data.token))return NextResponse.json({error:'Booking access denied.'},{status:403});
    const supabase=getAdminSupabase();
    const {data:job,error}=await supabase.from('jobs').select('id,status,service_key,provider_price_pence,platform_fee_pence,customer_total_pence,currency,payment_status,stripe_checkout_session_id,email,customer_name,matched_provider_id,postcode,urgency,quote_version,schedule_mode').eq('id',jobId).maybeSingle();
    if(error||!job)return NextResponse.json({error:'Booking not found.'},{status:404});
    if(job.status!=='accepted'||!job.matched_provider_id)return NextResponse.json({error:'The electrician has not accepted this booking yet.'},{status:409});
    if(job.payment_status==='paid')return NextResponse.json({error:'This booking is already paid.'},{status:409});
    if(!job.provider_price_pence||job.platform_fee_pence==null||!job.customer_total_pence)return NextResponse.json({error:'A final transparent quote is not available yet.'},{status:409});
    const stripe=getStripeClient();
    if(job.stripe_checkout_session_id){
      const existing=await stripe.checkout.sessions.retrieve(job.stripe_checkout_session_id);
      if(existing.status==='open'&&existing.url)return NextResponse.json({checkoutUrl:existing.url,sessionId:existing.id,reused:true});
    }
    const site=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,'');
    const transferGroup=transferGroupForJob(jobId);
    const postcodeArea=String(job.postcode||'').trim().toUpperCase().split(/\s+/)[0]||'unknown';
    // Keep payment metadata non-sensitive and operational. These fields give Radar
    // custom rules stable marketplace signals without putting names, full addresses,
    // descriptions or other customer PII into metadata.
    const riskMetadata={
      job_id:jobId,
      provider_id:job.matched_provider_id,
      service_key:String(job.service_key||'electrical').slice(0,80),
      postcode_area:postcodeArea.slice(0,12),
      urgency:String(job.urgency||'standard').slice(0,30),
      schedule_mode:String(job.schedule_mode||'asap').slice(0,30),
      quote_version:String(job.quote_version||1),
      customer_total_pence:String(job.customer_total_pence),
      provider_price_pence:String(job.provider_price_pence),
      platform_fee_pence:String(job.platform_fee_pence)
    };
    const session=await stripe.checkout.sessions.create({
      mode:'payment',
      customer_email:job.email,
      line_items:[
        {quantity:1,price_data:{currency:(job.currency||'GBP').toLowerCase(),unit_amount:Number(job.provider_price_pence),product_data:{name:job.service_key||'Electrical work',description:'Electrician agreed price — paid to the electrical business after completion and clearance.'}}},
        {quantity:1,price_data:{currency:(job.currency||'GBP').toLowerCase(),unit_amount:Number(job.platform_fee_pence),product_data:{name:'Platform service fee',description:'Transparent customer service fee for matching, verification, payment protection and service recovery.'}}}
      ],
      payment_intent_data:{transfer_group:transferGroup,metadata:riskMetadata},
      metadata:riskMetadata,
      success_url:`${site}/book?job=${encodeURIComponent(jobId)}&payment=success`,
      cancel_url:`${site}/book?job=${encodeURIComponent(jobId)}&payment=cancelled`,
      integration_identifier:STRIPE_INTEGRATION_IDENTIFIER
    },{idempotencyKey:`checkout:${jobId}:${job.customer_total_pence}`});
    await supabase.from('jobs').update({stripe_checkout_session_id:session.id,stripe_transfer_group:transferGroup,payment_status:'checkout_created',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',jobId);
    await supabase.from('audit_events').insert({event_type:'payment.checkout_created',entity_type:'job',entity_id:jobId,metadata:{checkoutSessionId:session.id,customerTotalPence:job.customer_total_pence,providerPricePence:job.provider_price_pence,platformFeePence:job.platform_fee_pence,radarSignals:{postcodeArea,urgency:job.urgency,scheduleMode:job.schedule_mode,quoteVersion:job.quote_version}}});
    return NextResponse.json({checkoutUrl:session.url,sessionId:session.id});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    if(error instanceof StripeConfigurationError)return NextResponse.json({error:'Stripe credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to create checkout.'},{status:500});
  }
}
