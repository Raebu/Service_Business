import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { LearnerMatchControls } from './MatchControls';

export const dynamic='force-dynamic';

type ConsentType='placement_matching'|'employer_sharing'|'guardian_approval';

export default async function LearnerAcademyPage(){
  const userDb=await getUserSupabase();if(!userDb)redirect('/account');
  const {data:{user}}=await userDb.auth.getUser();if(!user)redirect('/account');
  const admin=getAdminSupabase();
  const {data:learner}=await admin.from('learners').select('id,display_name,current_stage,age_band,status').eq('user_id',user.id).maybeSingle();
  if(!learner)redirect('/account');
  const [{data:consents},{data:matches},{data:placements}]=await Promise.all([
    admin.from('learner_consents').select('consent_type,granted,withdrawn_at,captured_at').eq('learner_id',learner.id).order('captured_at',{ascending:false}),
    admin.from('placement_matches').select('id,opportunity_id,score,distance_signal,skill_signal,demand_signal,status,updated_at').eq('learner_id',learner.id).order('score',{ascending:false}),
    admin.from('placements').select('id,provider_id,placement_type,status,starts_on,ends_on,completed_hours,agreed_hours').eq('learner_id',learner.id).order('starts_on',{ascending:false})
  ]);
  const currentConsent=(type:ConsentType)=>{const row=(consents||[]).find(c=>c.consent_type===type);return Boolean(row?.granted&&!row.withdrawn_at)};
  const matchingAllowed=currentConsent('placement_matching')&&currentConsent('employer_sharing')&&(learner.age_band==='18_plus'||currentConsent('guardian_approval'));
  const opportunityIds=[...new Set((matches||[]).map(m=>m.opportunity_id))];
  const {data:opportunities}=opportunityIds.length?await admin.from('employer_opportunities').select('id,provider_id,title,opportunity_type,postcode,paid,status,starts_on,ends_on').in('id',opportunityIds):{data:[]};
  const providerIds=[...new Set([...(opportunities||[]).map(o=>o.provider_id),...(placements||[]).map(p=>p.provider_id)])];
  const {data:providers}=providerIds.length?await admin.from('providers').select('id,organisation_id,verification_state').in('id',providerIds):{data:[]};
  const orgIds=[...new Set((providers||[]).map(p=>p.organisation_id))];
  const {data:organisations}=orgIds.length?await admin.from('organisations').select('id,name').in('id',orgIds):{data:[]};
  const opportunityMap=new Map((opportunities||[]).map(o=>[o.id,o]));const providerMap=new Map((providers||[]).map(p=>[p.id,p]));const orgMap=new Map((organisations||[]).map(o=>[o.id,o]));
  const visibleMatches=matchingAllowed?(matches||[]).filter(m=>!['rejected','expired'].includes(m.status)&&opportunityMap.get(m.opportunity_id)?.status==='open'):[];
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>My Academy</span><h1>{learner.display_name}</h1><p className='lede'>Review consented local opportunities, record your interest and follow supervised placements without exposing your contact details to employers before the controlled match workflow allows it.</p></div><div className='actions'><Link className='button' href='/account'>Back to account</Link></div></div><div className='metrics'><div><strong>{visibleMatches.length}</strong><span>current matches</span></div><div><strong>{(placements||[]).filter(p=>['planned','active'].includes(p.status)).length}</strong><span>active/planned placements</span></div><div><strong>{Number((placements||[]).reduce((sum,p)=>sum+Number(p.completed_hours||0),0)).toFixed(1)}</strong><span>recorded hours</span></div><div><strong>{learner.current_stage}</strong><span>current stage</span></div></div>{!matchingAllowed?<section className='portal-card'><h2>Matching paused</h2><p>Your current consent settings do not permit employer matching/sharing{learner.age_band!=='18_plus'?' or required guardian approval is not current':''}. No employer match details are shown while matching is paused.</p></section>:<section className='portal-card'><h2>Suggested opportunities</h2>{!visibleMatches.length?<p>No current consented opportunities are waiting for your response.</p>:visibleMatches.map(match=>{const opportunity=opportunityMap.get(match.opportunity_id);const provider=opportunity?providerMap.get(opportunity.provider_id):undefined;const employer=provider?orgMap.get(provider.organisation_id):undefined;return <article className='ops-record' key={match.id}><div className='record-row'><div><strong>{opportunity?.title||'Opportunity'} · {employer?.name||'Verified employer'}</strong><span>{opportunity?.opportunity_type?.replaceAll('_',' ')} · {opportunity?.postcode||''}{opportunity?.paid===true?' · paid':opportunity?.paid===false?' · unpaid/other':''} · skills {Number(match.skill_signal).toFixed(0)} · locality {Number(match.distance_signal).toFixed(0)} · demand {Number(match.demand_signal).toFixed(0)}</span></div><span className='status-pill'>{match.status} · {Number(match.score).toFixed(0)}%</span></div><LearnerMatchControls matchId={match.id} status={match.status}/></article>})}</section>}<section className='portal-card'><h2>My placements</h2>{!placements?.length?<p>No placements have been created yet.</p>:placements.map(p=>{const provider=providerMap.get(p.provider_id);const employer=provider?orgMap.get(provider.organisation_id):undefined;return <article className='record-row' key={p.id}><div><strong>{p.placement_type.replaceAll('_',' ')} · {employer?.name||'Verified employer'}</strong><span>{p.starts_on}{p.ends_on?` to ${p.ends_on}`:''} · {Number(p.completed_hours||0).toFixed(1)} / {p.agreed_hours?Number(p.agreed_hours).toFixed(1):'—'} hours</span></div><span className='status-pill'>{p.status}</span></article>})}</section><p className='note'>Interest is not a job offer or permission to work unsupervised. A mutual match still passes through consent, supervisor and placement controls. Apprentices and trainees remain blocked from independent electrical dispatch until separately verified competent under the provider workforce controls.</p></section>;
}
