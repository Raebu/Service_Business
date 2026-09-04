import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const actionSchema=z.object({action:z.enum(['accept','decline','complete'])});

export async function POST(request:Request,{params}:{params:Promise<{offerId:string}>}){
  const supabase=await getUserSupabase();
  if(!supabase)return NextResponse.json({error:'Authentication is not configured.'},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const parsed=actionSchema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:'Invalid offer action.'},{status:400});
  const {offerId}=await params;
  const {data:offer,error:offerError}=await supabase.from('job_offers').select('id,provider_id,status').eq('id',offerId).maybeSingle();
  if(offerError||!offer)return NextResponse.json({error:'Offer not found.'},{status:404});
  const {data:provider,error:providerError}=await supabase.from('providers').select('id,organisation_id').eq('id',offer.provider_id).maybeSingle();
  if(providerError||!provider)return NextResponse.json({error:'Provider not found.'},{status:404});
  const {data:membership}=await supabase.from('organisation_members').select('role').eq('organisation_id',provider.organisation_id).eq('user_id',user.id).maybeSingle();
  if(!membership)return NextResponse.json({error:'This offer is not assigned to your electrical business.'},{status:403});
  try{
    const admin=getAdminSupabase();
    const {data,error}=await admin.rpc('respond_to_job_offer',{p_offer_id:offerId,p_provider_id:provider.id,p_action:parsed.data.action});
    if(error){
      const conflict=['offer_not_available','offer_expired','job_not_available','job_not_owned_by_provider','job_not_completable','engineer_not_available','engineer_requires_supervision'].some(code=>error.message.includes(code));
      return NextResponse.json({error:conflict?'This job or offer is no longer available for that action.':'Unable to update the job offer.'},{status:conflict?409:500});
    }

    if(parsed.data.action==='accept'||parsed.data.action==='complete'){
      const jobId=typeof data==='object'&&data&&'jobId' in data?String((data as {jobId:string}).jobId):null;
      if(jobId){
        const {data:job}=await admin.from('jobs').select('email,service_key,assigned_engineer_id,matched_provider_id').eq('id',jobId).maybeSingle();
        if(job?.email){
          let providerName='a verified electrical business';let engineerName='';
          if(job.matched_provider_id){
            const {data:p}=await admin.from('providers').select('organisation_id').eq('id',job.matched_provider_id).maybeSingle();
            if(p?.organisation_id){const {data:o}=await admin.from('organisations').select('name').eq('id',p.organisation_id).maybeSingle();if(o?.name)providerName=o.name;}
          }
          if(job.assigned_engineer_id){const {data:e}=await admin.from('engineers').select('display_name').eq('id',job.assigned_engineer_id).maybeSingle();if(e?.display_name)engineerName=e.display_name;}
          await admin.rpc('queue_notification',{
            p_recipient_user_id:null,
            p_recipient_email:job.email,
            p_channel:'email',
            p_template_key:parsed.data.action==='accept'?'job.accepted_customer':'job.completed',
            p_payload:{jobId,serviceKey:job.service_key,providerName,engineerName},
            p_scheduled_at:new Date().toISOString()
          });
        }
      }
    }

    return NextResponse.json({result:data,message:parsed.data.action==='accept'?'Job accepted.':parsed.data.action==='decline'?'Job declined. The dispatch engine can now offer it to the next eligible provider.':'Job marked completed.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Provider actions are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to update the job offer.'},{status:500});
  }
}
