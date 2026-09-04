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
    return NextResponse.json({result:data,message:parsed.data.action==='accept'?'Job accepted.':parsed.data.action==='decline'?'Job declined. The dispatch engine can now offer it to the next eligible provider.':'Job marked completed.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Provider actions are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to update the job offer.'},{status:500});
  }
}
