import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { VerifyProviderForm } from './VerifyProviderForm';

export const dynamic='force-dynamic';

function slugify(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)}

export default async function ProviderReviewPage({params}:{params:Promise<{applicationId:string}>}){
  const admin=await getAdminSession();if(!admin)redirect('/account');
  const {applicationId}=await params;const supabase=getAdminSupabase();
  const {data:application}=await supabase.from('provider_applications').select('*').eq('id',applicationId).maybeSingle();
  if(!application)notFound();
  return <section className='page narrow'><div className='portal-heading'><div><span className='eyebrow'>Provider verification</span><h1>{application.business_name}</h1><p className='lede'>Review the application and record evidence before activating the public verification profile.</p></div><Link className='button' href='/ops'>Back to operations</Link></div><div className='panel'><h2>Application</h2><div className='detail-grid'><div><strong>Contact</strong><span>{application.contact_name}</span></div><div><strong>Email</strong><span>{application.email}</span></div><div><strong>Phone</strong><span>{application.phone}</span></div><div><strong>Company number</strong><span>{application.company_number||'Not supplied'}</span></div><div><strong>Website</strong><span>{application.website||'Not supplied'}</span></div><div><strong>Insurance expiry</strong><span>{application.insurance_expiry||'Not supplied'}</span></div><div><strong>Coverage</strong><span>{(application.coverage_areas||[]).join(', ')||'None'}</span></div><div><strong>Services</strong><span>{(application.services||[]).join(', ')||'None'}</span></div><div><strong>Scheme details</strong><span>{application.scheme_details||'Not supplied'}</span></div><div><strong>Can take apprentice</strong><span>{application.can_take_apprentice?'Yes':'No'}</span></div></div></div><VerifyProviderForm applicationId={applicationId} suggestedSlug={slugify(application.business_name)}/></section>;
}
