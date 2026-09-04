import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { StripeOnboarding } from './StripeOnboarding';

export const dynamic='force-dynamic';

export default async function ProviderPaymentsPage({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const {organisation}=await searchParams;if(!organisation)redirect('/account');
  const supabase=await getUserSupabase();if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/account');
  const [{data:membership},{data:org}]=await Promise.all([
    supabase.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle(),
    supabase.from('organisations').select('id,name,kind').eq('id',organisation).maybeSingle()
  ]);
  if(!membership||!org||org.kind!=='provider_business')redirect('/account');
  const {data:provider}=await supabase.from('providers').select('id,stripe_account_status,stripe_transfers_active,stripe_updated_at').eq('organisation_id',organisation).maybeSingle();
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Payments & settlements</span><h1>{org.name}</h1><p className='lede'>Customer payments are collected by the managed service. Your agreed job price is held as your entitlement and released after completion and clearance.</p></div><div className='actions'><Link className='button' href={`/portal/provider?organisation=${organisation}`}>Back to contractor portal</Link><Link className='button' href={`/portal/provider/pricing?organisation=${organisation}`}>Pricing</Link></div></div><div className='metrics'><div><strong>{provider?.stripe_account_status||'not_started'}</strong><span>Stripe account</span></div><div><strong>{provider?.stripe_transfers_active?'ready':'not ready'}</strong><span>transfers</span></div><div><strong>100%</strong><span>of agreed job price remains provider entitlement</span></div><div><strong>15%</strong><span>customer service fee policy</span></div></div><StripeOnboarding organisationId={organisation}/><p className='note'>The platform does not silently deduct a second commission from the electrician. Customer service fees, holds, refunds and settlement adjustments remain visible in the financial audit trail.</p></section>;
}
