import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({
  dayOfWeek:z.coerce.number().int().min(0).max(6),
  startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone:z.string().trim().min(3).max(80).default('Europe/London'),
  autoAccept:z.boolean().default(false),
  minimumJobPence:z.coerce.number().int().min(0).default(0),
  maximumDurationMinutes:z.coerce.number().int().positive().max(1440).optional(),
  maximumTravelMinutes:z.coerce.number().int().positive().max(480).optional()
}).refine(v=>v.endTime>v.startTime,{path:['endTime'],message:'End time must be after start time.'});

export async function POST(request:Request,{params}:{params:Promise<{engineerId:string}>}){
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Please check the availability rule.'},{status:400});
  const {engineerId}=await params;const userSupabase=await getUserSupabase();if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{
    const admin=getAdminSupabase();
    const {data:engineer}=await admin.from('engineers').select('id,organisation_id,user_id').eq('id',engineerId).maybeSingle();if(!engineer)return NextResponse.json({error:'Engineer not found.'},{status:404});
    const {data:membership}=await admin.from('organisation_members').select('role').eq('organisation_id',engineer.organisation_id).eq('user_id',user.id).maybeSingle();
    const allowed=engineer.user_id===user.id||Boolean(membership&&['owner','admin','manager','dispatcher'].includes(membership.role));if(!allowed)return NextResponse.json({error:'You cannot manage this schedule.'},{status:403});
    const {data:rule,error}=await admin.from('engineer_availability_rules').insert({engineer_id:engineerId,day_of_week:parsed.data.dayOfWeek,start_time:parsed.data.startTime,end_time:parsed.data.endTime,timezone:parsed.data.timezone,auto_accept:parsed.data.autoAccept,minimum_job_pence:parsed.data.minimumJobPence,maximum_duration_minutes:parsed.data.maximumDurationMinutes??null,maximum_travel_minutes:parsed.data.maximumTravelMinutes??null,active:true}).select('*').single();
    if(error)return NextResponse.json({error:'Unable to save availability.',detail:error.message},{status:500});
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'engineer.availability_added',entity_type:'engineer',entity_id:engineerId,metadata:{ruleId:rule.id,dayOfWeek:parsed.data.dayOfWeek,autoAccept:parsed.data.autoAccept}});
    return NextResponse.json({rule,message:'Availability rule saved.'},{status:201});
  }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Unable to save availability.'},{status:500});}
}
