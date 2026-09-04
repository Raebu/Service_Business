import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';
import { getStripeClient,StripeConfigurationError } from '@/lib/stripe';

export const runtime='nodejs';
const BATCH_SIZE=25;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();const stripe=getStripeClient();
    const {data:jobs,error}=await supabase.from('jobs').select('id,stripe_payment_intent_id,customer_total_pence,platform_fee_pence,matched_provider_id,refunded_pence,payment_status').not('stripe_payment_intent_id','is',null).is('payment_reconciled_at',null).in('payment_status',['paid','partially_refunded','refunded','disputed']).order('paid_at',{ascending:true}).limit(BATCH_SIZE);
    if(error)return NextResponse.json({error:'Unable to load payment reconciliation queue.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const job of jobs||[]){
      try{
        const intent=await stripe.paymentIntents.retrieve(job.stripe_payment_intent_id as string,{expand:['latest_charge.balance_transaction']});
        const charge=typeof intent.latest_charge==='object'&&intent.latest_charge?intent.latest_charge as Stripe.Charge:null;
        const balance=charge&&typeof charge.balance_transaction==='object'&&charge.balance_transaction?charge.balance_transaction as Stripe.BalanceTransaction:null;
        const expected=Number(job.customer_total_pence||0);const actual=Number(intent.amount_received||0);
        if(expected!==actual){
          await supabase.from('finance_reconciliation_exceptions').upsert({job_id:job.id,source:'stripe_payment_intent',source_id:intent.id,exception_type:'customer_total_mismatch',expected_pence:expected,actual_pence:actual,currency:(intent.currency||'gbp').toUpperCase(),details:{status:intent.status}},{onConflict:'source,source_id,exception_type'});
          results.push({jobId:job.id,status:'exception',type:'customer_total_mismatch'});continue;
        }
        if(!balance){
          await supabase.from('finance_reconciliation_exceptions').upsert({job_id:job.id,source:'stripe_payment_intent',source_id:intent.id,exception_type:'missing_balance_transaction',expected_pence:expected,actual_pence:actual,currency:(intent.currency||'gbp').toUpperCase(),details:{latestCharge:charge?.id||null}},{onConflict:'source,source_id,exception_type'});
          results.push({jobId:job.id,status:'exception',type:'missing_balance_transaction'});continue;
        }
        const fee=Math.max(0,Number(balance.fee||0));
        if(fee>0){
          await supabase.rpc('post_finance_journal',{p_idempotency_key:`stripe:fee:${balance.id}`,p_source_type:'stripe_processing_fee',p_source_id:balance.id,p_currency:(balance.currency||'gbp').toUpperCase(),p_lines:[{accountCode:'stripe_processing_fees',direction:'debit',amountPence:fee,jobId:job.id,providerId:job.matched_provider_id},{accountCode:'stripe_clearing',direction:'credit',amountPence:fee,jobId:job.id,providerId:job.matched_provider_id}],p_metadata:{stripeBalanceTransactionId:balance.id,stripePaymentIntentId:intent.id}});
        }
        const netMargin=Number(job.refunded_pence||0)>0?null:Number(job.platform_fee_pence||0)-fee;
        await supabase.from('jobs').update({stripe_processing_fee_pence:fee,stripe_net_received_pence:Number(balance.net||0),net_platform_margin_pence:netMargin,payment_reconciled_at:new Date().toISOString(),payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id);
        results.push({jobId:job.id,status:'reconciled',processingFeePence:fee,netReceivedPence:Number(balance.net||0),netPlatformMarginPence:netMargin});
      }catch(error){
        results.push({jobId:job.id,status:'error',message:error instanceof Error?error.message:'Reconciliation failed'});
      }
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Payment infrastructure is not configured.'},{status:503});
    return NextResponse.json({error:'Reconciliation worker failed.'},{status:500});
  }
}
