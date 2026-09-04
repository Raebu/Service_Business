import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { ProviderOfferActions } from '@/components/ProviderOfferActions';
import { EvidenceUploadForm } from './EvidenceUploadForm';

export const dynamic='force-dynamic';

export default async function ProviderPortalPage({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const {organisation}=await searchParams;
  if(!organisation)redirect('/account');
  const supabase=await getUserSupabase();
  if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/account');
  const [{data:membership},{data:org}]=await Promise.all([
    supabase.from('organisation_members').select('role').eq('organisation_id',organisation).maybeSingle(),
    supabase.from('organisations').select('id,name,kind,status').eq('id',organisation).maybeSingle()
  ]);
  if(!membership||!org||org.kind!=='provider_business')redirect('/account');
  const {data:provider}=await supabase.from('providers').select('id,public_slug,verification_state,verified_at,quality_score,acceptance_rate,completion_rate,rework_rate,available_now').eq('organisation_id',organisation).maybeSingle();
  if(!provider)return <section className='page narrow'><span className='eyebrow'>Contractor portal</span><h1>{org.name}</h1><p className='lede'>This organisation is linked to your account, but provider verification has not been activated yet.</p><p className='note'>Once onboarding creates the verified provider record, compliance, coverage, work offers and the public badge appear here.</p><Link className='button' href='/account'>Back to account</Link></section>;
  const [{data:evidence},{data:coverage},{data:services},{data:offers}]=await Promise.all([
    supabase.from('provider_evidence').select('id,kind,label,status,expires_at').eq('provider_id',provider.id).order('created_at',{ascending:false}),
    supabase.from('provider_coverage').select('area,active,priority').eq('provider_id',provider.id).order('priority'),
    supabase.from('provider_services').select('service_key,active').eq('provider_id',provider.id),
    supabase.from('job_offers').select('id,job_id,status,rank,expires_at,created_at').eq('provider_id',provider.id).order('created_at',{ascending:false}).limit(30)
  ]);
  const jobIds=(offers||[]).map(o=>o.job_id);
  const {data:jobs}=jobIds.length?await supabase.from('jobs').select('id,status,postcode,address,description,urgency,preferred_window,schedule_mode,requested_start,requested_end').in('id',jobIds):{data:[] as Array<{id:string;status:string;postcode:string;address:string;description:string;urgency:string;preferred_window:string|null;schedule_mode:string;requested_start:string|null;requested_end:string|null}>};
  const jobMap=new Map((jobs||[]).map(j=>[j.id,j]));
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Contractor portal</span><h1>{org.name}</h1><p className='lede'>Work, team, pricing, payments, finance, Academy opportunities, compliance, coverage and your network trust status in one place.</p></div><div className='actions'><Link className='button' href='/account'>Back to account</Link><Link className='button' href={`/portal/provider/team?organisation=${organisation}`}>Team & skills</Link><Link className='button' href={`/portal/provider/pricing?organisation=${organisation}`}>Pricing</Link><Link className='button' href={`/portal/provider/payments?organisation=${organisation}`}>Payments</Link><Link className='button' href={`/portal/provider/finance?organisation=${organisation}`}>Finance & audit</Link><Link className='button' href={`/portal/provider/academy?organisation=${organisation}`}>Academy & learners</Link><Link className='button primary' href={`/verify/${provider.public_slug}`}>View public verification</Link></div></div><div className='metrics'><div><strong>{provider.verification_state}</strong><span>verification</span></div><div><strong>{Number(provider.quality_score).toFixed(0)}</strong><span>quality score</span></div><div><strong>{Math.round(Number(provider.acceptance_rate)*100)}%</strong><span>acceptance</span></div><div><strong>{Math.round(Number(provider.completion_rate)*100)}%</strong><span>completion</span></div></div><div className='portal-grid'><section className='portal-card'><h2>Work offers</h2>{!offers?.length?<p>No work offers yet.</p>:offers.map(offer=>{const job=jobMap.get(offer.job_id);const timing=job?.requested_start?new Date(job.requested_start).toLocaleString('en-GB'):job?.schedule_mode==='asap'?'ASAP':job?.preferred_window||'';return <article className='offer-record' key={offer.id}><div className='record-row'><div><strong>{job?.description||'Electrical work'}</strong><span>{job?`${job.postcode} · ${job.urgency}${timing?` · ${timing}`:''}`:'Job details unavailable'}</span></div><span className='status-pill'>{offer.status}</span></div><ProviderOfferActions offerId={offer.id} status={offer.status}/></article>})}</section><section className='portal-card'><h2>Compliance evidence</h2>{!evidence?.length?<p>No evidence records yet.</p>:evidence.map(item=><article className='record-row' key={item.id}><div><strong>{item.label}</strong><span>{item.expires_at?`Expires ${new Date(item.expires_at).toLocaleDateString('en-GB')}`:item.kind}</span></div><span className='status-pill'>{item.status}</span></article>)}<EvidenceUploadForm organisationId={organisation}/></section><section className='portal-card'><h2>Coverage</h2>{!coverage?.length?<p>No coverage areas configured yet.</p>:<div className='chips'>{coverage.filter(x=>x.active).map(x=><span key={x.area}>{x.area}</span>)}</div>}</section><section className='portal-card'><h2>Services</h2>{!services?.length?<p>No services configured yet.</p>:<div className='chips'>{services.filter(x=>x.active).map(x=><span key={x.service_key}>{x.service_key}</span>)}</div>}</section></div></section>;
}
