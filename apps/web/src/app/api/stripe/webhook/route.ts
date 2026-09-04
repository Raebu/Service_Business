import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { getStripeClient,StripeConfigurationError } from '@/lib/stripe';

export const runtime='nodejs';

async function markReceipt(eventId:string,status:'processed'|'failed'|'ignored',errorMessage?:string){
  const supabase=getAdminSupabase();
  await supabase.from('stripe_event_receipts').update({processing_status:status,error_message:errorMessage||null,processed_at:new Date().toISOString()}).eq('event_id',eventId);
}

export async function POST(request:Request){
  const signature=request.headers.get('stripe-signature');
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!signature||!secret)return NextResponse.json({error:'Stripe webhook verification is not configured.'},{status:503});
  let event:Stripe.Event;
  try{
    const stripe=getStripeClient();
    const raw=await request.text();
    event=stripe.webhooks.constructEvent(raw,signature,secret);
  }catch{return NextResponse.json({error:'Invalid Stripe signature.'},{status:400})}

  try{
    const supabase=getAdminSupabase();
    const {error:receiptError}=await supabase.from('stripe_event_receipts').insert({event_id:event.id,event_type:event.type,stripe_created_at:new Date(event.created*1000).toISOString(),processing_status:'processing'});
    if(receiptError?.code==='23505')return NextResponse.json({received:true,duplicate:true});
    if(receiptError)return NextResponse.json({error:'Unable to record Stripe event.'},{status:500});

    try{
      if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
        const session=event.data.object as Stripe.Checkout.Session;
        const jobId=session.metadata?.job_id;
        if(!jobId){await markReceipt(event.id,'ignored');return NextResponse.json({received:true})}
        const paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null;
        const paid=event.type==='checkout.session.async_payment_succeeded'||session.payment_status==='paid';
        await supabase.from('jobs').update({stripe_payment_intent_id:paymentIntent,payment_status:paid?'paid':'processing',paid_at:paid?new Date().toISOString():null,settlement_status:paid?'held':'not_ready',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',jobId);
      }else if(event.type==='checkout.session.async_payment_failed'){
        const session=event.data.object as Stripe.Checkout.Session;const jobId=session.metadata?.job_id;
        if(jobId)await supabase.from('jobs').update({payment_status:'failed',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',jobId);
      }else if(event.type==='payment_intent.succeeded'){
        const intent=event.data.object as Stripe.PaymentIntent;const jobId=intent.metadata?.job_id;
        if(jobId){
          const chargeId=typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge?.id||null;
          const {data:job}=await supabase.from('jobs').select('provider_price_pence,platform_fee_pence,customer_total_pence,matched_provider_id').eq('id',jobId).maybeSingle();
          await supabase.from('jobs').update({stripe_payment_intent_id:intent.id,stripe_charge_id:chargeId,payment_status:'paid',paid_at:new Date().toISOString(),settlement_status:'held',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',jobId);
          if(job?.provider_price_pence&&job.platform_fee_pence!=null&&job.customer_total_pence){
            await supabase.rpc('post_finance_journal',{p_idempotency_key:`stripe:payment:${intent.id}`,p_source_type:'stripe_payment',p_source_id:intent.id,p_currency:'GBP',p_lines:[{accountCode:'stripe_clearing',direction:'debit',amountPence:Number(job.customer_total_pence),jobId,providerId:job.matched_provider_id},{accountCode:'provider_payable',direction:'credit',amountPence:Number(job.provider_price_pence),jobId,providerId:job.matched_provider_id},{accountCode:'platform_service_revenue',direction:'credit',amountPence:Number(job.platform_fee_pence),jobId}],p_metadata:{stripePaymentIntentId:intent.id,stripeChargeId:chargeId}});
          }
        }
      }else if(event.type==='payment_intent.payment_failed'){
        const intent=event.data.object as Stripe.PaymentIntent;const jobId=intent.metadata?.job_id;
        if(jobId)await supabase.from('jobs').update({stripe_payment_intent_id:intent.id,payment_status:'failed',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',jobId);
      }else if(event.type==='charge.dispute.created'){
        const dispute=event.data.object as Stripe.Dispute;const chargeId=typeof dispute.charge==='string'?dispute.charge:dispute.charge?.id;
        if(chargeId){
          const {data:job}=await supabase.from('jobs').select('id').eq('stripe_charge_id',chargeId).maybeSingle();
          if(job){
            await supabase.from('jobs').update({payment_status:'disputed',settlement_status:'blocked',dispute_status:dispute.status,payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id);
            await supabase.from('payment_adjustments').insert({job_id:job.id,adjustment_type:'dispute',amount_pence:dispute.amount,stripe_object_id:dispute.id,reason:dispute.reason,status:dispute.status});
            await supabase.from('job_cases').insert({job_id:job.id,case_type:'dispute',status:'open',priority:'high',summary:`Stripe dispute ${dispute.id} opened (${dispute.reason||'reason unavailable'}). Settlement automatically blocked.`});
          }
        }
      }else if(event.type==='charge.refunded'){
        const charge=event.data.object as Stripe.Charge;
        const {data:job}=await supabase.from('jobs').select('id,customer_total_pence').eq('stripe_charge_id',charge.id).maybeSingle();
        if(job){
          const refunded=Number(charge.amount_refunded||0);const full=refunded>=Number(job.customer_total_pence||charge.amount);
          await supabase.from('jobs').update({refunded_pence:refunded,payment_status:full?'refunded':'partially_refunded',settlement_status:'blocked',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id);
          if(refunded>0)await supabase.from('payment_adjustments').insert({job_id:job.id,adjustment_type:'refund',amount_pence:refunded,stripe_object_id:charge.id,reason:'Stripe refund recorded',status:full?'refunded':'partially_refunded'});
        }
      }else if(event.type==='transfer.reversed'){
        const transfer=event.data.object as Stripe.Transfer;
        const {data:job}=await supabase.from('jobs').select('id').eq('stripe_transfer_id',transfer.id).maybeSingle();
        if(job)await supabase.from('jobs').update({settlement_status:'reversed',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id);
      }else{
        await markReceipt(event.id,'ignored');return NextResponse.json({received:true,ignored:true});
      }
      await markReceipt(event.id,'processed');
      return NextResponse.json({received:true});
    }catch(error){
      await markReceipt(event.id,'failed',error instanceof Error?error.message:'Webhook processing failed');
      return NextResponse.json({error:'Stripe event processing failed.'},{status:500});
    }
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Payment infrastructure is not configured.'},{status:503});
    return NextResponse.json({error:'Stripe webhook failed.'},{status:500});
  }
}
