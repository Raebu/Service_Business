import { notFound } from 'next/navigation';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export default async function VerifyProviderPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  try{
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.from('public_provider_verification').select('*').eq('public_slug',slug).maybeSingle();
    if(error)throw error;
    if(!data)notFound();
    const nextExpiry=data.next_evidence_expiry?Date.parse(data.next_evidence_expiry):null;
    const active=data.verification_state==='active'&&(!nextExpiry||nextExpiry>Date.now());
    const site=(process.env.NEXT_PUBLIC_SITE_URL||'').replace(/\/$/,'');
    const verificationPath=`/verify/${encodeURIComponent(slug)}`;
    const badgePath=`/api/verify/${encodeURIComponent(slug)}/badge`;
    const verificationUrl=site?`${site}${verificationPath}`:verificationPath;
    const badgeUrl=site?`${site}${badgePath}`:badgePath;
    const embed=`<a href="${verificationUrl}" rel="noopener"><img src="${badgeUrl}" alt="National Electrician Hub verified network member — ${data.business_name}" width="360" height="92"></a>`;
    return <section className='page narrow'><span className='eyebrow'>Provider verification</span><h1>{data.business_name}</h1><p className='lede'>{active?'This electrical business currently has active network verification.':'This provider does not currently have active network verification.'}</p><div className={`verification-state ${active?'is-active':'is-inactive'}`}><strong>{active?'Verified network member':'Verification inactive'}</strong><span>{data.verification_state}</span></div><div className='cards three'><article><h2>Coverage</h2><p>{(data.coverage_areas||[]).join(', ')||'No public coverage listed.'}</p></article><article><h2>Services</h2><p>{(data.service_keys||[]).join(', ')||'No public services listed.'}</p></article><article><h2>Evidence status</h2><p>{data.next_evidence_expiry?`Next monitored evidence expiry: ${new Date(data.next_evidence_expiry).toLocaleDateString('en-GB')}`:'No public expiry date is currently shown.'}</p></article></div><section className='portal-card verification-badge-card'><h2>Website verification badge</h2><p>The badge is live: if this business's network verification becomes inactive, the embedded badge changes status automatically. The badge links back to this public verification record.</p><a href={verificationPath}><img src={badgePath} alt={`National Electrician Hub verification badge for ${data.business_name}`} width='360' height='92'/></a><h3>Embed code</h3><code className='embed-code'>{embed}</code></section><p className='note'>This page and badge confirm membership status in the National Electrician Hub managed-service network. They are not statutory accreditation and do not replace checks required for a particular regulated activity.</p></section>;
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return <section className='page narrow'><span className='eyebrow'>Provider verification</span><h1>Verification service not connected yet.</h1><p className='lede'>The public verification route is built, but production database credentials have not yet been attached to this deployment.</p></section>;
    throw error;
  }
}
