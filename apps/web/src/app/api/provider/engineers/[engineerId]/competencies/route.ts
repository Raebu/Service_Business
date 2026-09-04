import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({
  serviceKey:z.string().trim().min(2).max(120),
  competencyLevel:z.enum(['observer','supervised','competent','advanced']),
  evidenceReference:z.string().trim().max(500).optional().or(z.literal('')),
  expiresAt:z.string().datetime({offset:true}).optional().or(z.literal(''))
});

export async function POST(request:Request,{params}:{params:Promise<{engineerId:string}>}){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the competency details.'},{status:400});
  const {engineerId}=await params;
  const userSupabase=await getUserSupabase();if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{
    const admin=getAdminSupabase();
    const {data:engineer}=await admin.from('engineers').select('id,organisation_id,user_id').eq('id',engineerId).maybeSingle();
    if(!engineer)return NextResponse.json({error:'Engineer not found.'},{status:404});
    const {data:membership}=await admin.from('organisation_members').select('role').eq('organisation_id',engineer.organisation_id).eq('user_id',user.id).maybeSingle();
    const maySubmit=engineer.user_id===user.id||Boolean(membership&&['owner','admin','manager'].includes(membership.role));
    if(!maySubmit)return NextResponse.json({error:'You cannot update this engineer.'},{status:403});
    const {data:competency,error}=await admin.from('engineer_competencies').upsert({
      engineer_id:engineerId,
      service_key:parsed.data.serviceKey,
      competency_level:parsed.data.competencyLevel,
      verified:false,
      verified_at:null,
      verified_by:null,
      expires_at:parsed.data.expiresAt||null,
      evidence_reference:parsed.data.evidenceReference||null,
      updated_at:new Date().toISOString()
    },{onConflict:'engineer_id,service_key'}).select('id,service_key,competency_level,verified').single();
    if(error)return NextResponse.json({error:'Unable to save competency.',detail:error.message},{status:500});
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'engineer.competency_submitted',entity_type:'engineer',entity_id:engineerId,metadata:{serviceKey:parsed.data.serviceKey,competencyLevel:parsed.data.competencyLevel}});
    return NextResponse.json({competency,message:'Competency submitted for verification. It does not enable unsupervised work until verified.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to save competency.'},{status:500});
  }
}
