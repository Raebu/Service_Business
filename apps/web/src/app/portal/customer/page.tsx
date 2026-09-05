import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { CustomerReviewForm } from '@/components/CustomerReviewForm';

export const dynamic='force-dynamic';

export default async function CustomerPortalPage(){
  const supabase=await getUserSupabase();
  if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/account');
  const [{data:jobs},{data:properties},{data:reviews}]=await Promise.all([
    supabase.from('jobs').select('id,status,postcode,address,description,urgency,created_at').order('created_at',{ascending:false}).limit(50),
    supabase.from('properties').select('id,address,postcode,created_at').order('created_at',{ascending:false}).limit(50),
    supabase.from('reviews').select('id,job_id,rating,review,published,moderation_status,created_at').order('created_at',{ascending:false}).limit(100)
  ]);
  const reviewByJob=new Map((reviews||[]).map(review=>[review.job_id,review]));
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Customer workspace</span><h1>Your electrical service history.</h1><p className='lede'>Track work, properties, verified reviews and the records that build up around each address.</p></div><Link className='button' href='/account'>Back to account</Link></div><div className='portal-grid'><section className='portal-card'><h2>Your jobs</h2>{!jobs?.length?<p>No linked jobs yet.</p>:jobs.map(job=>{const existing=reviewByJob.get(job.id);const reviewable=['completed','closed'].includes(job.status);return <article key={job.id} className='record-row' style={{alignItems:'flex-start'}}><div style={{width:'100%'}}><div><strong>{job.description}</strong><span>{job.address} · {job.postcode}</span></div>{reviewable&&(existing?<div className='note' style={{marginTop:12}}>Your review: {existing.rating}/5 ★ · {existing.moderation_status}{existing.review?` · ${existing.review}`:''}</div>:<div style={{marginTop:16}}><CustomerReviewForm jobId={job.id}/></div>)}</div><span className='status-pill'>{job.status}</span></article>})}</section><section className='portal-card'><h2>Your properties</h2>{!properties?.length?<p>No linked properties yet.</p>:properties.map(property=><article className='record-row' key={property.id}><div><strong>{property.address}</strong><span>{property.postcode}</span></div></article>)}</section></div><p className='note'>Reviews are tied to verified completed bookings and enter moderation before publication. Jobs booked before an account exists are linked automatically when the customer signs in with the same email address.</p></section>;
}
