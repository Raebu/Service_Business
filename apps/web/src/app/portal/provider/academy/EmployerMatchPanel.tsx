import { getAdminSupabase } from '@/lib/supabase/admin';
import { MatchResponseControls } from './MatchResponseControls';

type ConsentType='placement_matching'|'employer_sharing'|'guardian_approval';

export async function EmployerMatchPanel({providerId,canRespond}:{providerId:string;canRespond:boolean}){
  const db=getAdminSupabase();
  const {data:opportunities}=await db.from('employer_opportunities').select('id,title,status').eq('provider_id',providerId).in('status',['open','paused']);
  const opportunityIds=(opportunities||[]).map(row=>row.id);
  if(!opportunityIds.length)return <section className='portal-card'><h2>Suggested learners</h2><p>Publish an opportunity before learner matches can be generated.</p></section>;
  const {data:matches}=await db.from('placement_matches').select('id,learner_id,opportunity_id,score,distance_signal,skill_signal,demand_signal,status,updated_at').in('opportunity_id',opportunityIds).not('status','in','(rejected,expired)').order('score',{ascending:false}).limit(50);
  const learnerIds=[...new Set((matches||[]).map(row=>row.learner_id))];
  const [{data:learners},{data:consents}]=learnerIds.length?await Promise.all([
    db.from('learners').select('id,display_name,current_stage,age_band,desired_skills,status').in('id',learnerIds),
    db.from('learner_consents').select('learner_id,consent_type,granted,withdrawn_at,captured_at').in('learner_id',learnerIds).in('consent_type',['placement_matching','employer_sharing','guardian_approval']).order('captured_at',{ascending:false})
  ]):[{data:[]},{data:[]}];
  const currentConsent=(learnerId:string,type:ConsentType)=>{const row=(consents||[]).find(c=>c.learner_id===learnerId&&c.consent_type===type);return Boolean(row?.granted&&!row.withdrawn_at)};
  const learnerMap=new Map((learners||[]).map(row=>[row.id,row]));
  const opportunityMap=new Map((opportunities||[]).map(row=>[row.id,row]));
  const visible=(matches||[]).filter(match=>{const learner=learnerMap.get(match.learner_id);if(!learner||learner.status!=='active')return false;if(!currentConsent(learner.id,'placement_matching')||!currentConsent(learner.id,'employer_sharing'))return false;if(learner.age_band!=='18_plus'&&!currentConsent(learner.id,'guardian_approval'))return false;return true});
  return <section className='portal-card'><h2>Suggested learners</h2>{!visible.length?<p>No current consented learner matches are available. Learner identity is hidden immediately if employer-sharing or required guardian consent is withdrawn.</p>:visible.map(match=>{const learner=learnerMap.get(match.learner_id)!;const opportunity=opportunityMap.get(match.opportunity_id);return <article className='ops-record' key={match.id}><div className='record-row'><div><strong>{learner.display_name} → {opportunity?.title||'Opportunity'}</strong><span>{learner.current_stage} · {learner.desired_skills?.length?learner.desired_skills.join(', '):'skills not specified'} · skills {Number(match.skill_signal).toFixed(0)} · locality {Number(match.distance_signal).toFixed(0)} · demand {Number(match.demand_signal).toFixed(0)}</span></div><span className='status-pill'>{match.status} · {Number(match.score).toFixed(0)}%</span></div>{canRespond&&<MatchResponseControls matchId={match.id} status={match.status}/>}</article>})}<p className='form-help'>Only current consented matching information is shown. Contact details are intentionally withheld here; a mutual match moves into the controlled placement/consent workflow rather than bypassing it.</p></section>;
}
