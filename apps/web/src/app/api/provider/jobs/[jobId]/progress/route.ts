import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({eventType:z.enum(['en_route','arrived','started','paused','resumed','completed','delay_reported']),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional(),note:z.string().trim().max(500).optional()});

export async function POST(request:Request,{params}:{params:Promise<{jobId:string}>}){
  const {jobId}=await params;const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the progress update.'},{status:400});
  const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{
    const admin=getAdminSupabase();
    const {data:job}=await admin.from('jobs').select('id,assigned_engineer_id,status').eq('id',jobId).maybeSingle();if(!job)return NextResponse.json({error:'Job not found.'},{status:404});
    const {data:engineer}=job.assigned_engineer_id?await admin.from('engineers').select('id,user_id,organisation_id').eq('id',job.assigned_engineer_id).maybeSingle():{data:null};
    if(!engineer||engineer.user_id!==user.id)return NextResponse.json({error:'This job is not assigned to your engineer account.'},{status:403});
    const now=new Date().toISOString();const patch:Record<string,unknown>={last_progress_at:now,updated_at:now};
    if(parsed.data.eventType==='arrived')patch.arrived_at=now;
    if(parsed.data.eventType==='started'){patch.work_started_at=now;patch.status='in_progress'}
    if(parsed.data.eventType==='completed'){patch.completed_at=now;patch.status='completed';patch.operational_risk_state='normal'}
    await admin.from('job_progress_events').insert({job_id:jobId,engineer_id:engineer.id,event_type:parsed.data.eventType,occurred_at:now,latitude:parsed.data.latitude??null,longitude:parsed.data.longitude??null,note:parsed.data.note||null,source:'engineer_portal'});
    const {error}=await admin.from('jobs').update(patch).eq('id',jobId);if(error)return NextResponse.json({error:'Unable to update the job.'},{status:500});
    if(['arrived','started','completed'].includes(parsed.data.eventType))await admin.from('recovery_signals').update({status:'actioned',action_taken:`Engineer reported ${parsed.data.eventType}.`}).eq('job_id',jobId).eq('status','open');
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:`job.progress.${parsed.data.eventType}`,entity_type:'job',entity_id:jobId,metadata:{engineerId:engineer.id}});
    return NextResponse.json({ok:true,eventType:parsed.data.eventType,occurredAt:now});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to update progress.'},{status:500});
  }
}
