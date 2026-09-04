import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export default async function CustomerPortalPage(){
  const supabase=await getUserSupabase();
  if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/account');
  const [{data:jobs},{data:properties}]=await Promise.all([
    supabase.from('jobs').select('id,status,postcode,address,description,urgency,created_at').order('created_at',{ascending:false}).limit(50),
    supabase.from('properties').select('id,address,postcode,created_at').order('created_at',{ascending:false}).limit(50)
  ]);
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Customer workspace</span><h1>Your electrical service history.</h1><p className='lede'>Track work, properties and the records that build up around each address.</p></div><Link className='button' href='/account'>Back to account</Link></div><div className='portal-grid'><section className='portal-card'><h2>Your jobs</h2>{!jobs?.length?<p>No linked jobs yet.</p>:jobs.map(job=><article className='record-row' key={job.id}><div><strong>{job.description}</strong><span>{job.address} · {job.postcode}</span></div><span className='status-pill'>{job.status}</span></article>)}</section><section className='portal-card'><h2>Your properties</h2>{!properties?.length?<p>No linked properties yet.</p>:properties.map(property=><article className='record-row' key={property.id}><div><strong>{property.address}</strong><span>{property.postcode}</span></div></article>)}</section></div><p className='note'>Jobs booked before an account exists are linked automatically when the customer signs in with the same email address.</p></section>;
}
