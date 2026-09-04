import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export default async function BusinessPortalPage({searchParams}:{searchParams:Promise<{organisation?:string}>}){
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
  if(!membership||!org||org.kind!=='business_client')redirect('/account');
  const {data:properties}=await supabase.from('properties').select('id,address,postcode,created_at').eq('business_organisation_id',organisation).order('created_at',{ascending:false});
  const propertyIds=(properties||[]).map(p=>p.id);
  const {data:jobs}=propertyIds.length?await supabase.from('jobs').select('id,property_id,status,address,postcode,description,urgency,created_at').in('property_id',propertyIds).order('created_at',{ascending:false}).limit(100):{data:[] as Array<{id:string;property_id:string|null;status:string;address:string;postcode:string;description:string;urgency:string;created_at:string}>};
  const openJobs=(jobs||[]).filter(job=>!['completed','cancelled'].includes(job.status));
  const completed=(jobs||[]).filter(job=>job.status==='completed');
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Business portal</span><h1>{org.name}</h1><p className='lede'>One view across properties, live electrical work and service history.</p></div><Link className='button' href='/account'>Back to account</Link></div><div className='metrics'><div><strong>{properties?.length||0}</strong><span>properties / sites</span></div><div><strong>{openJobs.length}</strong><span>open jobs</span></div><div><strong>{completed.length}</strong><span>completed jobs</span></div><div><strong>{jobs?.length||0}</strong><span>total jobs</span></div></div><div className='portal-grid'><section className='portal-card'><h2>Open work</h2>{!openJobs.length?<p>No open electrical work.</p>:openJobs.map(job=><article className='record-row' key={job.id}><div><strong>{job.description}</strong><span>{job.address} · {job.postcode}</span></div><span className='status-pill'>{job.status}</span></article>)}</section><section className='portal-card'><h2>Portfolio</h2>{!properties?.length?<p>No properties or sites linked yet.</p>:properties.map(property=><article className='record-row' key={property.id}><div><strong>{property.address}</strong><span>{property.postcode}</span></div></article>)}</section><section className='portal-card'><h2>Recent completed work</h2>{!completed.length?<p>No completed work yet.</p>:completed.slice(0,20).map(job=><article className='record-row' key={job.id}><div><strong>{job.description}</strong><span>{job.address}</span></div><span className='status-pill'>completed</span></article>)}</section><section className='portal-card'><h2>Coming next</h2><p>Compliance dashboards, certificate storage, SLA reporting, planned maintenance, spend and consolidated invoicing will build on this organisation-scoped data model.</p></section></div></section>;
}
