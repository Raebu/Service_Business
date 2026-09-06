import { NextResponse } from 'next/server';
import { z } from 'zod';
import { customerMayAccessJob } from '@/lib/job-access';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { getStripeClient,StripeConfigurationError,STRIPE_INTEGRATION_IDENTIFIER,transferGroupForJob } from '@/lib/stripe';

const schema=z.object({token:z.string().min(20).optional()});

export async function POST(request:Request,{params}:{params:Promise<{jobId:string;quoteId:string}>}){
  const {jobId,quoteId}=await params;
  const parsed=schema.safeParse(await request.json().catch(()=>({})));
  if(!parsed.success)return NextResponse.json({error:'Invalid checkout request.'},{status:400});
  try{
    if(!await customerMayAccessJob(jobId,parsed.data.token))return NextResponse.json({error:'Booking access denied.'},{status:403});
    const db=getAdminSupabase();
    const [{data:job,error:jobError},{data:quote,error:quoteError}]=await Promise.all([
      db.from('jobs').select('id,email,postcode,service_key,matched_provider_id,currency').eq('id',jobId).maybeSingle(),
      db.from('follow_on_quotes').select('id,job_id,description,status,expires_at,provider_id,provider_price_pence,platform_fee_pence,customer_total_pence,payment_status,stripe_checkout_session_id').eq('id',quoteId).eq('job_id',jobId).maybeSingle()
    ]);
    if(jobError||quoteError||!job||!quote)return NextResponse.json({error:'Approved additional-work quote not found.'},{status:404});
    if(quote.status!=='approved')return NextResponse.json({error:'This additional-work quote must be approved before payment.'},{status:409});
    if(quote.expires_at&&new Date(quote.expires_at)<=new Date())return NextResponse.json({error:'This quote has expired.'},{status:409});
    if(quote.payment_status==='paid')return NextResponse.json({error:'This additional-work quote is already paid.'},{status:409});
    if(!quote.provider_price_pence||quote.platform_fee_pence==null||!quote.customer_total_pence)return NextResponse.json({error:'The additional-work price is incomplete.'},{status:409});
    if(!job.matched_provider_id||quote.provider_id!==job.matched_provider_id)return NextResponse.json({error:'The approved quote no longer matches the assigned provider.'},{status:409});

    const stripe=getStripeClient();
    if(quote.stripe_checkout_session_id){
      const existing=await stripe.checkout.sessions.retrieve(quote.stripe_checkout_session_id);
      if(existing.status==='open'&&existing.url)return NextResponse.json({checkoutUrl:existing.url,sessionId:existing.id,reused:true});
    }
    const site=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,'');
    const transferGroup=`${transferGroupForJob(jobId)}:follow-on:${quoteId}`;
    const metadata={
      payment_kind:'follow_on_quote',
      job_id:jobId,
      follow_on_quote_id:quoteId,
      provider_id:String(quote.provider_id),
      postcode_area:String(job.postcode||'').trim().toUpperCase().split(/\s+/)[0]||'unknown',
      customer_total_pence:String(quote.customer_total_pence),
      provider_price_pence:String(quote.provider_price_pence),
      platform_fee_pence:String(quote.platform_fee_pence)
    };
    const session=await stripe.checkout.sessions.create({
      mode:'payment',
      customer_email:job.email,
      line_items:[
        {quantity:1,price_data:{currency:(job.currency||'GBP').toLowerCase(),unit_amount:Number(quote.provider_price_pence),product_data:{name:'Approved additional electrical work',description:String(quote.description).slice(0,500)}}},
        {quantity:1,price_data:{currency:(job.currency||'GBP').toLowerCase(),unit_amount:Number(quote.platform_fee_pence),product_data:{name:'Platform service fee',description:'Transparent customer service fee for the additional approved work.'}}}
      ],
      payment_intent_data:{transfer_group:transferGroup,metadata},
      metadata,
      success_url:`${site}/book?job=${encodeURIComponent(jobId)}&followOn=${encodeURIComponent(quoteId)}&payment=success`,
      cancel_url:`${site}/book?job=${encodeURIComponent(jobId)}&followOn=${encodeURIComponent(quoteId)}&payment=cancelled`,
      integration_identifier:STRIPE_INTEGRATION_IDENTIFIER
    },{idempotencyKey:`follow-on-checkout:${quoteId}:${quote.customer_total_pence}`});
    const now=new Date().toISOString();
    await db.from('follow_on_quotes').update({stripe_checkout_session_id:session.id,stripe_transfer_group:transferGroup,payment_status:'checkout_created',payment_updated_at:now}).eq('id',quoteId).eq('job_id',jobId);
    await db.from('audit_events').insert({event_type:'follow_on_quote.checkout_created',entity_type:'job',entity_id:jobId,metadata:{quoteId,checkoutSessionId:session.id,customerTotalPence:quote.customer_total_pence,providerPricePence:quote.provider_price_pence,platformFeePence:quote.platform_fee_pence}});
    return NextResponse.json({checkoutUrl:session.url,sessionId:session.id});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    if(error instanceof StripeConfigurationError)return NextResponse.json({error:'Stripe credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to create additional-work checkout.'},{status:500});
  }
}
