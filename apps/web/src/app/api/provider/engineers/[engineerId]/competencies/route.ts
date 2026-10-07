import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrganisationCapability } from '@/lib/authorisation';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({
  serviceKey:z.string().trim().min(2).max(120),
  competencyLevel:z.enum(['observer','supervised','competent','advanced']),
  evidenceReference:z.string().trim().max(500).optional().or(z.literal('')),
  expiresAt:z.string().datetime({offset:true}).optional().or(z.literal(''))
});

const reviewSchema=z.object({
  competencyId:z.string().uuid(),
  action:z.enum(['verify','revoke'])
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
    const maySubmitSelf=engineer.user_id===user.id;
    const teamAuth=maySubmitSelf?null:await requireOrganisationCapability(engineer.organisation_id,'manage_team');
    if(!maySubmitSelf&&!teamAuth)return NextResponse.json({error:'Team-management capability required.'},{status:403});
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
    },{onConflict:'engineer_id,service_key'}).select('id,service_key,competency_level,verified,evidence_reference,expires_at').single();
    if(error)return NextResponse.json({error:'Unable to save competency.',detail:error.message},{status:500});
    await admin.rpc('refresh_engineer_unsupervised_status',{p_engineer_id:engineerId});
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'engineer.competency_submitted',entity_type:'engineer',entity_id:engineerId,metadata:{serviceKey:parsed.data.serviceKey,competencyLevel:parsed.data.competencyLevel,evidenceReferencePresent:Boolean(parsed.data.evidenceReference),expiresAt:parsed.data.expiresAt||null}});
    return NextResponse.json({competency,message:'Competency submitted for independent verification. It does not enable unsupervised work until verified.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to save competency.'},{status:500});
  }
}

export async function PATCH(request:Request,{params}:{params:Promise<{engineerId:string}>}){
  const parsed=reviewSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the competency review request.'},{status:400});
  const {engineerId}=await params;
  try{
    const admin=getAdminSupabase();
    const {data:engineer}=await admin.from('engineers').select('id,organisation_id').eq('id',engineerId).maybeSingle();
    if(!engineer)return NextResponse.json({error:'Engineer not found.'},{status:404});
    const auth=await requireOrganisationCapability(engineer.organisation_id,'manage_team');
    if(!auth)return NextResponse.json({error:'Team-management capability required to review competency evidence.'},{status:403});
    const {data:existing}=await admin.from('engineer_competencies').select('id,service_key,competency_level,evidence_reference,expires_at,verified').eq('id',parsed.data.competencyId).eq('engineer_id',engineerId).maybeSingle();
    if(!existing)return NextResponse.json({error:'Competency record not found.'},{status:404});
    if(parsed.data.action==='verify'){
      if(!existing.evidence_reference)return NextResponse.json({error:'Add an evidence reference before verifying this competency.'},{status:409});
      if(existing.expires_at&&new Date(existing.expires_at).getTime()<=Date.now())return NextResponse.json({error:'Expired competency evidence cannot be verified. Update the expiry/evidence first.'},{status:409});
      const now=new Date().toISOString();
      const {error}=await admin.from('engineer_competencies').update({verified:true,verified_at:now,verified_by:auth.user.id,updated_at:now}).eq('id',existing.id).eq('engineer_id',engineerId);
      if(error)return NextResponse.json({error:'Unable to verify competency.',detail:error.message},{status:500});
      await admin.rpc('refresh_engineer_unsupervised_status',{p_engineer_id:engineerId});
      await admin.from('audit_events').insert({actor_user_id:auth.user.id,event_type:'engineer.competency_verified',entity_type:'engineer',entity_id:engineerId,metadata:{competencyId:existing.id,serviceKey:existing.service_key,competencyLevel:existing.competency_level,expiresAt:existing.expires_at,authorisedByCapability:'manage_team',authorisingRole:auth.role}});
      return NextResponse.json({ok:true,message:'Competency evidence verified. Dispatch eligibility has been recalculated.'});
    }
    const now=new Date().toISOString();
    const {error}=await admin.from('engineer_competencies').update({verified:false,verified_at:null,verified_by:null,updated_at:now}).eq('id',existing.id).eq('engineer_id',engineerId);
    if(error)return NextResponse.json({error:'Unable to revoke competency verification.',detail:error.message},{status:500});
    await admin.rpc('refresh_engineer_unsupervised_status',{p_engineer_id:engineerId});
    await admin.from('audit_events').insert({actor_user_id:auth.user.id,event_type:'engineer.competency_verification_revoked',entity_type:'engineer',entity_id:engineerId,metadata:{competencyId:existing.id,serviceKey:existing.service_key,competencyLevel:existing.competency_level,authorisedByCapability:'manage_team',authorisingRole:auth.role}});
    return NextResponse.json({ok:true,message:'Competency verification revoked. Dispatch eligibility has been recalculated.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to review competency.'},{status:500});
  }
}
