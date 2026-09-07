import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { requireOrganisationCapability } from '@/lib/authorisation';

async function loadPendingEngineer(engineerId:string){
  const admin=getAdminSupabase();
  const {data:engineer,error}=await admin.from('engineers').select('id,organisation_id,display_name,email,status,user_id').eq('id',engineerId).maybeSingle();
  if(error||!engineer)return null;
  return engineer;
}

export async function POST(request:Request,{params}:{params:Promise<{engineerId:string}>}){
  const {engineerId}=await params;
  try{
    const engineer=await loadPendingEngineer(engineerId);
    if(!engineer)return NextResponse.json({error:'Engineer not found.'},{status:404});
    const auth=await requireOrganisationCapability(engineer.organisation_id,'manage_team');
    if(!auth)return NextResponse.json({error:'Team-management access required.'},{status:403});
    if(engineer.user_id)return NextResponse.json({error:'This engineer already has a linked login.'},{status:409});
    if(!engineer.email)return NextResponse.json({error:'An email address is required before resending an invitation.'},{status:409});
    if(engineer.status!=='invited')return NextResponse.json({error:`Invitation cannot be resent while engineer status is ${engineer.status}.`},{status:409});
    const admin=getAdminSupabase();
    const site=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,'');
    const {error}=await admin.auth.admin.inviteUserByEmail(engineer.email,{redirectTo:`${site}/account`,data:{name:engineer.display_name,organisation_id:engineer.organisation_id}});
    if(error)return NextResponse.json({error:'Unable to resend invitation.',detail:error.message},{status:502});
    await admin.from('audit_events').insert({actor_user_id:auth.user.id,event_type:'engineer.invitation_resent',entity_type:'engineer',entity_id:engineer.id,metadata:{organisationId:engineer.organisation_id,email:engineer.email,authorisingRole:auth.role}});
    return NextResponse.json({ok:true,message:'Login invitation resent.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to resend invitation.'},{status:500});
  }
}

export async function DELETE(_request:Request,{params}:{params:Promise<{engineerId:string}>}){
  const {engineerId}=await params;
  try{
    const engineer=await loadPendingEngineer(engineerId);
    if(!engineer)return NextResponse.json({error:'Engineer not found.'},{status:404});
    const auth=await requireOrganisationCapability(engineer.organisation_id,'manage_team');
    if(!auth)return NextResponse.json({error:'Team-management access required.'},{status:403});
    if(engineer.user_id)return NextResponse.json({error:'A linked team member cannot be removed through invitation revocation.'},{status:409});
    if(engineer.status!=='invited')return NextResponse.json({error:'Only a pending invitation can be revoked here.'},{status:409});
    const admin=getAdminSupabase();
    const {data:assigned}=await admin.from('jobs').select('id').eq('assigned_engineer_id',engineer.id).limit(1);
    if(assigned?.length)return NextResponse.json({error:'This engineer already has a job history and cannot be removed as a pending invitation.'},{status:409});
    const {error}=await admin.from('engineers').delete().eq('id',engineer.id).is('user_id',null).eq('status','invited');
    if(error)return NextResponse.json({error:'Unable to revoke invitation.',detail:error.message},{status:500});
    await admin.from('audit_events').insert({actor_user_id:auth.user.id,event_type:'engineer.invitation_revoked',entity_type:'organisation',entity_id:engineer.organisation_id,metadata:{engineerId:engineer.id,email:engineer.email,authorisingRole:auth.role}});
    return NextResponse.json({ok:true,message:'Pending team invitation revoked. Any later sign-in with that email will not be attached to this business unless invited again.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to revoke invitation.'},{status:500});
  }
}
