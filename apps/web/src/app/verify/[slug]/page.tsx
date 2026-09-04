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
    return <section className='page narrow'><span className='eyebrow'>Provider verification</span><h1>{data.business_name}</h1><p className='lede'>{active?'This electrical business currently has active network verification.':'This provider does not currently have active network verification.'}</p><div className={`verification-state ${active?'is-active':'is-inactive'}`}><strong>{active?'Verified network member':'Verification inactive'}</strong><span>{data.verification_state}</span></div><div className='cards three'><article><h2>Coverage</h2><p>{(data.coverage_areas||[]).join(', ')||'No public coverage listed.'}</p></article><article><h2>Services</h2><p>{(data.service_keys||[]).join(', ')||'No public services listed.'}</p></article><article><h2>Evidence status</h2><p>{data.next_evidence_expiry?`Next monitored evidence expiry: ${new Date(data.next_evidence_expiry).toLocaleDateString('en-GB')}`:'No public expiry date is currently shown.'}</p></article></div><p className='note'>This page confirms membership status in this managed-service network. It is not a statutory accreditation and does not replace checks required for a particular regulated activity.</p></section>;
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return <section className='page narrow'><span className='eyebrow'>Provider verification</span><h1>Verification service not connected yet.</h1><p className='lede'>The public verification route is built, but production database credentials have not yet been attached to this deployment.</p></section>;
    throw error;
  }
}
