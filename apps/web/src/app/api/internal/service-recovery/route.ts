import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';
import { getStripeClient,StripeConfigurationError } from '@/lib/stripe';

const BATCH=20;

type Policy={code:string;action:'refund_full'|'refund_partial'|'rework'|'reassign'|'none';refund_percent:number|null;requires_payment:boolean;requires_no_open_safety_case:boolean};

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const stripe=getStripeClient();
    const {data:cases,error}=await supabase.from('job_cases')
      .select('id,job_id,case_type,policy_code,automation_state,refund_pence')
      .eq('automation_state','eligible').not('policy_code','is',null).order('created_at',{ascending:true}).limit(BATCH);
    if(error)return NextResponse.json({error:'Unable to load recovery cases.'},{status:500});
    const results:Array<Record<string,unknown>>=[];

    for(const item of cases||[]){
      const now=new Date().toISOString();
      const claimed=await supabase.from('job_cases').update({automation_state:'processing',automation_error:null,updated_at:now}).eq('id',item.id).eq('automation_state','eligible').select('id').maybeSingle();
      if(!claimed.data){results.push({caseId:item.id,status:'skipped'});continue}
      try{
        const [{data:policy},{data:job},{data:safetyCases}]=await Promise.all([
          supabase.from('service_recovery_policies').select('code,action,refund_percent,requires_payment,requires_no_open_safety_case').eq('code',item.policy_code).eq('active',true).maybeSingle(),
          supabase.from('jobs').select('id,status,payment_status,customer_total_pence,provider_price_pence,refunded_pence,stripe_payment_intent_id,stripe_transfer_id,settlement_status').eq('id',item.job_id).maybeSingle(),
          supabase.from('job_cases').select('id').eq('job_id',item.job_id).eq('case_type','safety').not('status','in','("resolved","closed")').limit(1)
        ]);
        if(!policy||!job)throw new Error('Recovery policy or job is unavailable.');
        const p=policy as Policy;
        if(p.requires_no_open_safety_case&&(safetyCases||[]).length)throw new Error('Open safety case requires human review.');
        if(p.requires_payment&&!['paid','partially_refunded'].includes(job.payment_status))throw new Error('Refund policy requires a settled customer payment.');

        if(p.action==='rework'||p.action==='reassign'){
          await supabase.from('jobs').update({settlement_status:'blocked',status:p.action==='reassign'?'new':job.status,updated_at:now}).eq('id',job.id);
          await supabase.from('job_cases').update({automation_state:'completed',automation_action:p.action,automated_at:now,resolution:p.action==='reassign'?'Automatically returned to dispatch under approved recovery policy.':'Settlement blocked and rework workflow activated under approved recovery policy.',status:'resolved',resolved_at:now,updated_at:now}).eq('id',item.id);
          await supabase.from('audit_events').insert({event_type:`service_recovery.${p.action}`,entity_type:'job_case',entity_id:item.id,metadata:{jobId:job.id,policyCode:p.code}});
          results.push({caseId:item.id,status:'completed',action:p.action});continue;
        }
        if(p.action==='none'){
          await supabase.from('job_cases').update({automation_state:'completed',automation_action:'none',automated_at:now,status:'resolved',resolved_at:now,resolution:'Policy completed without a financial action.',updated_at:now}).eq('id',item.id);
          results.push({caseId:item.id,status:'completed',action:'none'});continue;
        }

        if(!job.stripe_payment_intent_id)throw new Error('Stripe payment intent is unavailable.');
        const total=Number(job.customer_total_pence||0);const already=Number(job.refunded_pence||0);
        const policyAmount=p.action==='refund_full'?total:Math.round(total*Number(p.refund_percent||0)/100);
        const requested=item.refund_pence==null?policyAmount:Number(item.refund_pence);
        const amount=Math.max(0,Math.min(total-already,requested));
        if(amount<=0)throw new Error('No refundable customer balance remains.');

        if(job.stripe_transfer_id&&Number(job.provider_price_pence||0)>0){
          const providerRecovery=Math.min(Number(job.provider_price_pence),amount);
          if(providerRecovery>0){
            const reversal=await stripe.transfers.createReversal(job.stripe_transfer_id,{amount:providerRecovery,metadata:{job_id:job.id,case_id:item.id,policy_code:p.code}},{idempotencyKey:`service-recovery:transfer-reversal:${item.id}`});
            await supabase.from('payment_adjustments').insert({job_id:job.id,adjustment_type:'transfer_reversal',amount_pence:providerRecovery,stripe_object_id:reversal.id,reason:`Service recovery ${p.code}`,status:'recorded'});
          }
        }

        const refund=await stripe.refunds.create({payment_intent:job.stripe_payment_intent_id,amount,metadata:{job_id:job.id,case_id:item.id,policy_code:p.code}},{idempotencyKey:`service-recovery:refund:${item.id}`});
        const newRefunded=already+amount;const full=newRefunded>=total;
        await supabase.from('jobs').update({refunded_pence:newRefunded,payment_status:full?'refunded':'partially_refunded',settlement_status:'blocked',payment_updated_at:now,updated_at:now}).eq('id',job.id);
        await supabase.from('payment_adjustments').insert({job_id:job.id,adjustment_type:'refund',amount_pence:amount,stripe_object_id:refund.id,reason:`Automated service recovery policy ${p.code}`,status:refund.status||'pending'});
        await supabase.from('job_cases').update({automation_state:'completed',automation_action:p.action,refund_pence:amount,automated_at:now,status:'resolved',resolved_at:now,resolution:`Automated ${full?'full':'partial'} refund of ${amount} pence under policy ${p.code}.`,updated_at:now}).eq('id',item.id);
        await supabase.from('audit_events').insert({event_type:'service_recovery.refund_executed',entity_type:'job_case',entity_id:item.id,metadata:{jobId:job.id,policyCode:p.code,refundId:refund.id,amountPence:amount,full}});
        results.push({caseId:item.id,status:'completed',action:p.action,amountPence:amount});
      }catch(error){
        const message=error instanceof Error?error.message:'Recovery automation failed.';
        await supabase.from('job_cases').update({automation_state:'exception',automation_error:message,updated_at:new Date().toISOString()}).eq('id',item.id);
        results.push({caseId:item.id,status:'exception',error:message});
      }
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Payment infrastructure is not configured.'},{status:503});
    return NextResponse.json({error:'Service recovery worker failed.'},{status:500});
  }
}
