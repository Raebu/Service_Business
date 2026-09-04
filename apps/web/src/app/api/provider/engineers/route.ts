import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const engineerSchema=z.object({
  organisationId:z.string().uuid(),
  displayName:z.string().trim().min(2).max(120),
  email:z.string().trim().toLowerCase().email(),
  phone:z.string().trim().max(30).optional().or(z.literal('')),
  employmentRole:z.enum(['owner','engineer','dispatcher','apprentice','trainee']).default('engineer')
});

export async function POST(request:Request){
  const parsed=engineerSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the engineer details.'},{status:400});
  const userSupabase=await getUserSupabase();
  if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',parsed.data.organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership||!['owner','admin','manager'].includes(membership.role))return NextResponse.json({error:'Business owner or manager access required.'},{status:403});
  try{
    const admin=getAdminSupabase();
    const {data:org}=await admin.from('organisations').select('id,kind,name').eq('id',parsed.data.organisationId).maybeSingle();
    if(!org||org.kind!=='provider_business')return NextResponse.json({error:'Provider business not found.'},{status:404});
    const {data:existingProfile}=await admin.from('profiles').select('id').ilike('email',parsed.data.email).maybeSingle();
    const {data:engineer,error}=await admin.from('engineers').insert({
      organisation_id:parsed.data.organisationId,
      user_id:existingProfile?.id||null,
      display_name:parsed.data.displayName,
      email:parsed.data.email,
      phone:parsed.data.phone||null,
      employment_role:parsed.data.employmentRole,
      status:existingProfile?'active':'invited',
      can_work_unsupervised:false
    }).select('id,display_name,email,employment_role,status,user_id').single();
    if(error){
      if(error.code==='23505')return NextResponse.json({error:'That person is already on this business account.'},{status:409});
      return NextResponse.json({error:'Unable to add engineer.',detail:error.message},{status:500});
    }
    let invitationSent=false;
    let invitationError:string|null=null;
    if(existingProfile?.id){
      await admin.from('organisation_members').upsert({organisation_id:parsed.data.organisationId,user_id:existingProfile.id,role:parsed.data.employmentRole==='owner'?'owner':parsed.data.employmentRole==='dispatcher'?'dispatcher':'member'},{onConflict:'organisation_id,user_id'});
    }else{
      const site=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,'');
      const {error:inviteError}=await admin.auth.admin.inviteUserByEmail(parsed.data.email,{
        redirectTo:`${site}/account`,
        data:{name:parsed.data.displayName,organisation_id:parsed.data.organisationId,organisation_name:org.name,employment_role:parsed.data.employmentRole}
      });
      if(inviteError)invitationError=inviteError.message;
      else invitationSent=true;
      if(inviteError)await admin.rpc('queue_notification_once',{
        p_dedupe_key:`engineer.invitation_delivery_failed:${engineer.id}`,
        p_recipient_user_id:null,
        p_recipient_email:null,
        p_channel:'webhook',
        p_template_key:'engineer.invitation_delivery_failed',
        p_payload:{engineerId:engineer.id,email:parsed.data.email,error:inviteError.message,organisationId:parsed.data.organisationId},
        p_scheduled_at:new Date().toISOString()
      });
    }
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'engineer.created',entity_type:'engineer',entity_id:engineer.id,metadata:{organisationId:parsed.data.organisationId,employmentRole:parsed.data.employmentRole,invitationSent,invitationError}});
    return NextResponse.json({engineer,invitationSent,invitationError,message:existingProfile?'Engineer added and linked to their existing login.':invitationSent?'Engineer added and login invitation sent.':'Engineer added, but the login invitation could not be delivered. The record will still link automatically if they sign in with this email.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to add engineer.'},{status:500});
  }
}
