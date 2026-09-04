import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { TeamManager,CompetencyForm } from './TeamManager';

export const dynamic='force-dynamic';

type Engineer={id:string;display_name:string;email:string|null;employment_role:string;status:string;can_work_unsupervised:boolean;available_now:boolean;user_id:string|null};
type Competency={id:string;engineer_id:string;service_key:string;competency_level:string;verified:boolean;expires_at:string|null};

export default async function ProviderTeamPage({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const {organisation}=await searchParams;if(!organisation)redirect('/account');
  const supabase=await getUserSupabase();if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/account');
  const [{data:membership},{data:org}]=await Promise.all([
    supabase.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle(),
    supabase.from('organisations').select('id,name,kind').eq('id',organisation).maybeSingle()
  ]);
  if(!membership||!org||org.kind!=='provider_business')redirect('/account');
  const {data:engineersData}=await supabase.from('engineers').select('id,display_name,email,employment_role,status,can_work_unsupervised,available_now,user_id').eq('organisation_id',organisation).order('display_name');
  const engineers=(engineersData||[]) as Engineer[];
  const ids=engineers.map(x=>x.id);
  const {data:competencyData}=ids.length?await supabase.from('engineer_competencies').select('id,engineer_id,service_key,competency_level,verified,expires_at').in('engineer_id',ids).order('service_key'):{data:[] as Competency[]};
  const competencies=(competencyData||[]) as Competency[];
  const canManage=['owner','admin','manager'].includes(membership.role);
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Electrical business team</span><h1>{org.name}</h1><p className='lede'>Individual engineer identities, skills and login status. Dispatch can only treat someone as independently eligible after verified competency allows unsupervised work.</p></div><div className='actions'><Link className='button' href={`/portal/provider?organisation=${organisation}`}>Back to contractor portal</Link><Link className='button' href={`/portal/provider/pricing?organisation=${organisation}`}>Pricing</Link></div></div><div className='portal-grid'><section className='portal-card'><h2>People</h2>{engineers.length===0?<p>No engineers have been added yet.</p>:engineers.map(engineer=><article className='ops-record' key={engineer.id}><div className='record-row'><div><strong>{engineer.display_name}</strong><span>{engineer.employment_role} · {engineer.email||'No email'} · {engineer.user_id?'login linked':'login pending'}</span></div><span className='status-pill'>{engineer.can_work_unsupervised?'independent':'supervised only'}</span></div><div className='chips'>{competencies.filter(c=>c.engineer_id===engineer.id).map(c=><span key={c.id}>{c.service_key}: {c.competency_level} · {c.verified?'verified':'pending'}</span>)}</div>{(canManage||engineer.user_id===user.id)&&<CompetencyForm engineerId={engineer.id}/>}</article>)}</section>{canManage&&<TeamManager organisationId={organisation}/>}</div><p className='note'>Apprentice and trainee roles are always prevented at database level from being marked as unsupervised. Other engineers only become independently dispatchable once a competent/advanced skill has been verified and is still in date.</p></section>;
}
