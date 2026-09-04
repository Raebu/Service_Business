import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export default async function AcademyPortalPage({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const {organisation}=await searchParams;
  if(!organisation)redirect('/account');
  const supabase=await getUserSupabase();
  if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/account');
  const [{data:membership},{data:org},{data:interests}]=await Promise.all([
    supabase.from('organisation_members').select('role').eq('organisation_id',organisation).maybeSingle(),
    supabase.from('organisations').select('id,name,kind,status').eq('id',organisation).maybeSingle(),
    supabase.from('academy_interest').select('id,audience,organisation_or_name,postcode,details,status,created_at').order('created_at',{ascending:false})
  ]);
  if(!membership||!org||org.kind!=='education_provider')redirect('/account');
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Academy workspace</span><h1>{org.name}</h1><p className='lede'>Employer engagement, placements and progression activity will live here as the Academy network grows.</p></div><Link className='button' href='/account'>Back to account</Link></div><div className='portal-grid'><section className='portal-card'><h2>Your Academy registrations</h2>{!interests?.length?<p>No registration records are linked to this email yet.</p>:interests.map(item=><article className='record-row' key={item.id}><div><strong>{item.audience.replaceAll('_',' ')}</strong><span>{item.postcode} · {item.details}</span></div><span className='status-pill'>{item.status}</span></article>)}</section><section className='portal-card'><h2>Planned workspace capabilities</h2><ul><li>Employer relationships</li><li>Placement opportunities</li><li>Apprenticeship introductions</li><li>Industry talks and mentoring</li><li>Learner progression evidence</li><li>Local workforce-demand signals</li></ul></section></div></section>;
}
