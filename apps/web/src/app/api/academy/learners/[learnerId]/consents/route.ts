import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({
  consentType:z.enum(['placement_matching','employer_sharing','evidence_recording','guardian_approval']),
  action:z.enum(['grant','withdraw']),
  guardianName:z.string().trim().max(160).optional(),
  guardianRelationship:z.string().trim().max(80).optional(),
  note:z.string().trim().max(500).optional()
});

export async function POST(request:Request,{params}:{params:Promise<{learnerId:string}>}){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the consent update.'},{status:400});
  const {learnerId}=await params;
  const userSupabase=await getUserSupabase();
  if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{
    const admin=getAdminSupabase();
    const {data:learner}=await admin.from('learners').select('id,education_organisation_id,age_band,display_name').eq('id',learnerId).maybeSingle();
    if(!learner)return NextResponse.json({error:'Learner not found.'},{status:404});
    const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',learner.education_organisation_id).eq('user_id',user.id).maybeSingle();
    if(!membership)return NextResponse.json({error:'Education-partner membership required.'},{status:403});

    const now=new Date().toISOString();
    if(parsed.data.action==='withdraw'){
      const {error}=await admin.from('learner_consents').update({withdrawn_at:now,notes:parsed.data.note||'Consent withdrawn through Academy workspace.'}).eq('learner_id',learnerId).eq('consent_type',parsed.data.consentType).eq('granted',true).is('withdrawn_at',null);
      if(error)return NextResponse.json({error:'Unable to withdraw consent.',detail:error.message},{status:500});
      if(parsed.data.consentType==='guardian_approval'){
        await admin.from('learner_consents').update({withdrawn_at:now,notes:'Automatically withdrawn because guardian approval was withdrawn.'}).eq('learner_id',learnerId).in('consent_type',['placement_matching','employer_sharing','evidence_recording']).eq('granted',true).is('withdrawn_at',null);
      }
      await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'academy.consent_withdrawn',entity_type:'learner',entity_id:learnerId,metadata:{consentType:parsed.data.consentType}});
      return NextResponse.json({message:parsed.data.consentType==='guardian_approval'?'Guardian approval withdrawn. Matching, employer sharing and evidence recording have also been disabled.':'Consent withdrawn immediately.'});
    }

    const under18=learner.age_band!=='18_plus';
    if(under18&&parsed.data.consentType!=='guardian_approval'){
      const {data:guardian}=await admin.from('learner_consents').select('id').eq('learner_id',learnerId).eq('consent_type','guardian_approval').eq('granted',true).is('withdrawn_at',null).order('captured_at',{ascending:false}).limit(1).maybeSingle();
      if(!guardian)return NextResponse.json({error:'Current guardian approval is required before this consent can be granted for an under-18 learner.'},{status:409});
    }
    if(parsed.data.consentType==='guardian_approval'&&under18&&!parsed.data.guardianName)return NextResponse.json({error:'Guardian name is required.'},{status:400});

    const {error}=await admin.from('learner_consents').insert({
      learner_id:learnerId,
      consent_type:parsed.data.consentType,
      granted:true,
      granted_by_name:parsed.data.consentType==='guardian_approval'?parsed.data.guardianName||null:null,
      granted_by_relationship:parsed.data.consentType==='guardian_approval'?parsed.data.guardianRelationship||null:null,
      captured_by:user.id,
      notes:parsed.data.note||'Consent granted through Academy workspace.'
    });
    if(error)return NextResponse.json({error:'Unable to record consent.',detail:error.message},{status:500});
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'academy.consent_granted',entity_type:'learner',entity_id:learnerId,metadata:{consentType:parsed.data.consentType}});
    return NextResponse.json({message:'Consent recorded.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to update learner consent.'},{status:500});
  }
}
