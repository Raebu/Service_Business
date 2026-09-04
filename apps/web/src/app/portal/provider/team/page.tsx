import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { TeamManager,CompetencyForm,AvailabilityForm,LiveLocationControl } from './TeamManager';
import { TimeOffManager } from './TimeOffManager';

export const dynamic='force-dynamic';

type Engineer={id:string;display_name:string;email:string|null;employment_role:string;status:string;can_work_unsupervised:boolean;available_now:boolean;user_id:string|null};
type Competency={id:string;engineer_id:string;service_key:string;competency_level:string;verified:boolean;expires_at:string|null};
type Availability={id:string;engineer_id:string;day_of_week:number;start_time:string;end_time:string;auto_accept:boolean;minimum_job_pence:number;maximum_duration_minutes:number|null;maximum_travel_minutes:number|null;buffer_before_minutes:number;buffer_after_minutes:number;maximum_jobs_per_day:number|null;allowed_service_keys:string[]};
type TimeOff={id:string;engineer_id:string;starts_at:string;ends_at:string;reason:string|null};
const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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
  const engineers=(engineersData||[]) as Engineer[];const ids=engineers.map(x=>x.id);
  const [{data:competencyData},{data:availabilityData},{data:timeOffData}]=ids.length?await Promise.all([
    supabase.from('engineer_competencies').select('id,engineer_id,service_key,competency_level,verified,expires_at').in('engineer_id',ids).order('service_key'),
    supabase.from('engineer_availability_rules').select('id,engineer_id,day_of_week,start_time,end_time,auto_accept,minimum_job_pence,maximum_duration_minutes,maximum_travel_minutes,buffer_before_minutes,buffer_after_minutes,maximum_jobs_per_day,allowed_service_keys').in('engineer_id',ids).eq('active',true).order('day_of_week'),
    supabase.from('engineer_time_off').select('id,engineer_id,starts_at,ends_at,reason').in('engineer_id',ids).gte('ends_at',new Date().toISOString()).order('starts_at')
  ]):[{data:[] as Competency[]},{data:[] as Availability[]},{data:[] as TimeOff[]}];
  const competencies=(competencyData||[]) as Competency[];const availability=(availabilityData||[]) as Availability[];const timeOff=(timeOffData||[]) as TimeOff[];
  const canManage=['owner','admin','manager'].includes(membership.role);const canSchedule=canManage||membership.role==='dispatcher';
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Electrical business team</span><h1>{org.name}</h1><p className='lede'>Individual engineer identities, skills, working hours, time off, calendar export, location and auto-accept rules. Dispatch can only treat someone as independently eligible after verified competency allows unsupervised work.</p></div><div className='actions'><Link className='button' href={`/portal/provider?organisation=${organisation}`}>Back to contractor portal</Link><Link className='button' href={`/portal/provider/pricing?organisation=${organisation}`}>Pricing</Link></div></div><div className='portal-grid'><section className='portal-card'><h2>People</h2>{engineers.length===0?<p>No engineers have been added yet.</p>:engineers.map(engineer=>{const engineerRules=availability.filter(a=>a.engineer_id===engineer.id);const engineerTimeOff=timeOff.filter(t=>t.engineer_id===engineer.id);return <article className='ops-record' key={engineer.id}><div className='record-row'><div><strong>{engineer.display_name}</strong><span>{engineer.employment_role} · {engineer.email||'No email'} · {engineer.user_id?'login linked':'login pending'}</span></div><span className='status-pill'>{engineer.can_work_unsupervised?'independent':'supervised only'}</span></div><div className='actions'><a className='button' href={`/api/provider/engineers/${engineer.id}/calendar.ics`}>Export calendar (.ics)</a></div><div className='chips'>{competencies.filter(c=>c.engineer_id===engineer.id).map(c=><span key={c.id}>{c.service_key}: {c.competency_level} · {c.verified?'verified':'pending'}</span>)}</div>{engineerRules.length>0&&<div className='schedule-summary'>{engineerRules.map(rule=><span key={rule.id}><strong>{dayNames[rule.day_of_week]} {rule.start_time.slice(0,5)}–{rule.end_time.slice(0,5)}</strong>{rule.auto_accept?' · auto-accept':''}{rule.maximum_travel_minutes?` · ≤${rule.maximum_travel_minutes} min travel`:''}{` · ${rule.buffer_before_minutes}/${rule.buffer_after_minutes} min buffers`}{rule.maximum_jobs_per_day?` · ≤${rule.maximum_jobs_per_day} jobs`:''}{rule.allowed_service_keys?.length?` · ${rule.allowed_service_keys.join(', ')}`:''}</span>)}</div>}{(canSchedule||engineer.user_id===user.id)&&<TimeOffManager engineerId={engineer.id} initial={engineerTimeOff}/>} {engineer.user_id===user.id&&<LiveLocationControl engineerId={engineer.id}/>} {(canManage||engineer.user_id===user.id)&&<CompetencyForm engineerId={engineer.id}/>} {(canSchedule||engineer.user_id===user.id)&&<AvailabilityForm engineerId={engineer.id}/>}</article>})}</section>{canManage&&<TeamManager organisationId={organisation}/>}</div><p className='note'>Apprentice and trainee roles are always prevented at database level from being marked as unsupervised. Other engineers only become independently dispatchable once a competent/advanced skill has been verified and is still in date. Time off is included in availability checks. Calendar export is optional and does not make the platform depend on an external calendar. Precise live location is opt-in and short-lived.</p></section>;
}
