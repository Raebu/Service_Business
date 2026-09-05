import { NextResponse } from 'next/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { getStripeClient, StripeConfigurationError, transferGroupForJob } from '@/lib/stripe';
import { internalRequestAuthorised } from '@/lib/internal';

const BATCH_SIZE=25;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const stripe=getStripeClient();
    const {data:jobs,error}=await supabase.from('jobs')
      .select('id,status,payment_status,settlement_status,provider_price_pence,matched_provider_id,stripe_transfer_group,stripe_transfer_id,stripe_payment_intent_id,stripe_charge_id')
      .eq('status','completed')
      .eq('payment_status','paid')
      .in('settlement_status',['held','eligible'])
      .is('stripe_transfer_id',null)
      .order('updated_at',{ascending:true})
      .limit(BATCH_SIZE);
    if(error)return NextResponse.json({error:'Unable to load settlement queue.'},{status:500});

    const results:Array<Record<string,unknown>>=[];
    for(const job of jobs||[]){
      const {data:eligible,error:eligibilityError}=await supabase.rpc('mark_job_settlement_eligible',{p_job_id:job.id});
      if(eligibilityError||!eligible){results.push({jobId:job.id,status:'blocked'});continue}
      if(!job.matched_provider_id||!job.provider_price_pence){results.push({jobId:job.id,status:'missing_provider_or_amount'});continue}
      const {data:provider,error:providerError}=await supabase.from('providers').select('id,stripe_account_id').eq('id',job.matched_provider_id).maybeSingle();
      if(providerError||!provider?.stripe_account_id){results.push({jobId:job.id,status:'provider_not_payout_ready'});continue}

      // Do not rely on a stale local flag at the point money moves. Accounts v2 is
      // authoritative for recipient transfer capability and outstanding requirements.
      const account=await stripe.v2.core.accounts.retrieve(provider.stripe_account_id,{include:['configuration.recipient','requirements']});
      const raw=account as unknown as Record<string,any>;
      const transferState=raw.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
      const transfersActive=transferState==='active';
      const requirements=raw.requirements||{};
      const hasRequirements=Array.isArray(requirements?.currently_due)?requirements.currently_due.length>0:Boolean(requirements?.summary?.minimum_deadline);
      const accountStatus=transfersActive?'active':hasRequirements?'restricted':'pending';
      await supabase.from('providers').update({stripe_account_status:accountStatus,stripe_transfers_active:transfersActive,stripe_requirements:requirements,stripe_updated_at:new Date().toISOString()}).eq('id',provider.id);
      if(!transfersActive){results.push({jobId:job.id,status:'provider_not_payout_ready',transferState});continue}

      let sourceChargeId=job.stripe_charge_id as string|null;
      if(!sourceChargeId&&job.stripe_payment_intent_id){
        const intent=await stripe.paymentIntents.retrieve(job.stripe_payment_intent_id as string);
        sourceChargeId=typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge?.id||null;
        if(sourceChargeId)await supabase.from('jobs').update({stripe_charge_id:sourceChargeId,updated_at:new Date().toISOString()}).eq('id',job.id);
      }
      if(!sourceChargeId){results.push({jobId:job.id,status:'missing_source_charge'});continue}

      const transferGroup=job.stripe_transfer_group||transferGroupForJob(job.id);
      await supabase.from('jobs').update({settlement_status:'transferring',stripe_transfer_group:transferGroup,payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id).eq('settlement_status','eligible');
      try{
        const transfer=await stripe.transfers.create({
          amount:Number(job.provider_price_pence),
          currency:'gbp',
          destination:provider.stripe_account_id,
          source_transaction:sourceChargeId,
          transfer_group:transferGroup,
          metadata:{job_id:job.id,provider_id:job.matched_provider_id,source_charge_id:sourceChargeId}
        },{idempotencyKey:`service-business:settlement:${job.id}`});
        const now=new Date().toISOString();
        await supabase.from('jobs').update({stripe_transfer_id:transfer.id,settlement_status:'transferred',transferred_at:now,payment_updated_at:now,updated_at:now}).eq('id',job.id);
        await supabase.rpc('post_finance_journal',{
          p_idempotency_key:`stripe:transfer:${transfer.id}`,
          p_source_type:'stripe_transfer',
          p_source_id:transfer.id,
          p_currency:'GBP',
          p_lines:[
            {accountCode:'provider_payable',direction:'debit',amountPence:Number(job.provider_price_pence),jobId:job.id,providerId:job.matched_provider_id},
            {accountCode:'stripe_clearing',direction:'credit',amountPence:Number(job.provider_price_pence),jobId:job.id,providerId:job.matched_provider_id}
          ],
          p_metadata:{stripeTransferId:transfer.id,transferGroup,sourceChargeId}
        });
        await supabase.from('audit_events').insert({event_type:'settlement.transferred',entity_type:'job',entity_id:job.id,metadata:{providerId:job.matched_provider_id,amountPence:Number(job.provider_price_pence),stripeTransferId:transfer.id,sourceChargeId}});
        results.push({jobId:job.id,status:'transferred',transferId:transfer.id,amountPence:Number(job.provider_price_pence),sourceChargeId});
      }catch(transferError){
        await supabase.from('jobs').update({settlement_status:'eligible',payment_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id).eq('settlement_status','transferring');
        results.push({jobId:job.id,status:'transfer_failed',error:transferError instanceof Error?transferError.message:'transfer failed'});
      }
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Settlement infrastructure is not configured.'},{status:503});
    return NextResponse.json({error:'Settlement worker failed.'},{status:500});
  }
}
