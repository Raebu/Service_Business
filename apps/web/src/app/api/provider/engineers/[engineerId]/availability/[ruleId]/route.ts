import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { requireOrganisationCapability } from '@/lib/authorisation';

const schema=z.object({
  startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  autoAccept:z.boolean(),
  minimumJobPence:z.coerce.number().int().min(0),
  maximumDurationMinutes:z.coerce.number().int().positive().max(1440).nullable().optional(),
  maximumTravelMinutes:z.coerce.number().int().positive().max(480).nullable().optional(),
  bufferBeforeMinutes:z.coerce.number().int().min(0).max(240),
  bufferAfterMinutes:z.coerce.number().int().min(0).max(240),
  maximumJobsPerDay:z.coerce.number().int().min(1).max(50).nullable().optional(),
  allowedServiceKeys:z.array(z.string().trim().min(2).max(120)).max(50)
}).refine(v=>v.endTime>v.startTime,{path:['endTime'],message:'End time must be after start time.'});

async function authorise(engineerId:string,userId:string){
  const admin=getAdminSupabase();
  const {data:engineer}=await admin.from('engineers').select('id,organisation_id,user_id').eq('id',engineerId).maybeSingle();
  if(!engineer)return{ok:false as const,status:404,error:'Engineer not found.'};
  const allowed=engineer.user_id===userId||Boolean(await requireOrganisationCapability(engineer.organisation_id,'dispatch_jobs'));
  if(!allowed)return{ok:false as const,status:403,error:'You cannot manage this schedule.'};
  return{ok:true as const,admin,engineer};
}

export async function PATCH(request:Request,{params}:{params:Promise<{engineerId:string;ruleId:string}>}){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the availability rule.'},{status:400});
  const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{
    const {engineerId,ruleId}=await params;const auth=await authorise(engineerId,user.id);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
    const {data:existing}=await auth.admin.from('engineer_availability_rules').select('id,engineer_id,day_of_week').eq('id',ruleId).eq('engineer_id',engineerId).maybeSingle();
    if(!existing)return NextResponse.json({error:'Availability rule not found.'},{status:404});
    const {data:rule,error}=await auth.admin.from('engineer_availability_rules').update({
      start_time:parsed.data.startTime,end_time:parsed.data.endTime,auto_accept:parsed.data.autoAccept,
      minimum_job_pence:parsed.data.minimumJobPence,maximum_duration_minutes:parsed.data.maximumDurationMinutes??null,
      maximum_travel_minutes:parsed.data.maximumTravelMinutes??null,buffer_before_minutes:parsed.data.bufferBeforeMinutes,
      buffer_after_minutes:parsed.data.bufferAfterMinutes,maximum_jobs_per_day:parsed.data.maximumJobsPerDay??null,
      allowed_service_keys:parsed.data.allowedServiceKeys,active:true
    }).eq('id',ruleId).eq('engineer_id',engineerId).select('*').single();
    if(error)return NextResponse.json({error:'Unable to update availability.',detail:error.message},{status:409});
    await auth.admin.from('audit_events').insert({actor_user_id:user.id,event_type:'engineer.availability_updated',entity_type:'engineer',entity_id:engineerId,metadata:{ruleId,dayOfWeek:existing.day_of_week,autoAccept:parsed.data.autoAccept,maximumTravelMinutes:parsed.data.maximumTravelMinutes??null,maximumJobsPerDay:parsed.data.maximumJobsPerDay??null}});
    return NextResponse.json({rule,message:'Availability rule updated.'});
  }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Unable to update availability.'},{status:500});}
}

export async function DELETE(_request:Request,{params}:{params:Promise<{engineerId:string;ruleId:string}>}){
  const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{
    const {engineerId,ruleId}=await params;const auth=await authorise(engineerId,user.id);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
    const {data:existing}=await auth.admin.from('engineer_availability_rules').select('id,day_of_week').eq('id',ruleId).eq('engineer_id',engineerId).eq('active',true).maybeSingle();
    if(!existing)return NextResponse.json({error:'Availability rule not found.'},{status:404});
    const {error}=await auth.admin.from('engineer_availability_rules').update({active:false}).eq('id',ruleId).eq('engineer_id',engineerId);
    if(error)return NextResponse.json({error:'Unable to remove availability.',detail:error.message},{status:409});
    await auth.admin.from('audit_events').insert({actor_user_id:user.id,event_type:'engineer.availability_removed',entity_type:'engineer',entity_id:engineerId,metadata:{ruleId,dayOfWeek:existing.day_of_week}});
    return NextResponse.json({ok:true,message:'Availability rule removed.'});
  }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Unable to remove availability.'},{status:500});}
}
