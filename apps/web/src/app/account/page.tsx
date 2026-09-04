import Link from 'next/link';
import { SignInForm } from '@/components/SignInForm';
import { SignOutButton } from '@/components/SignOutButton';
import { getUserSupabase } from '@/lib/supabase/server';

export const dynamic='force-dynamic';

type Membership={role:string;organisations:{id:string;name:string;kind:string;vertical_id:string}|null};

export default async function AccountPage(){
  const supabase=await getUserSupabase();
  const userResult=supabase?await supabase.auth.getUser():null;
  const user=userResult?.data.user||null;
  if(!user)return <section className='page'><span className='eyebrow'>Your account</span><h1>One sign-in. The right workspace.</h1><p className='lede'>Customers, electrical businesses and corporate clients each get a purpose-built account. Sign in with the email attached to your relationship with the service.</p><div className='split'><div className='cards account-preview'><article><h2>Customers</h2><p>Jobs, appointments, properties, certificates and electrical history.</p></article><article><h2>Electrical businesses</h2><p>Work offers, schedule, compliance, coverage, quality and verification badge.</p></article><article><h2>Business clients</h2><p>Sites, jobs, SLAs, compliance, reporting, spend and team permissions.</p></article></div><SignInForm/></div><p className='note'>Internal operations administration is separate from customer-facing accounts.</p></section>;

  const [{data:profile},{data:memberships}]=await Promise.all([
    supabase!.from('profiles').select('display_name,email,default_role').eq('id',user.id).maybeSingle(),
    supabase!.from('organisation_members').select('role,organisations(id,name,kind,vertical_id)')
  ]);
  const typedMemberships=(memberships||[]) as unknown as Membership[];
  const providerOrgs=typedMemberships.filter(m=>m.organisations?.kind==='provider_business');
  const businessOrgs=typedMemberships.filter(m=>m.organisations?.kind==='business_client');
  const educationOrgs=typedMemberships.filter(m=>m.organisations?.kind==='education_provider');

  return <section className='page'><div className='account-header'><div><span className='eyebrow'>Your account</span><h1>Welcome{profile?.display_name?`, ${profile.display_name}`:''}.</h1><p className='lede'>Choose the workspace you need. You only see organisations and records linked to this signed-in account.</p></div><SignOutButton/></div><div className='cards three workspace-cards'><article><span>Personal</span><h2>Customer workspace</h2><p>Your electrical jobs, properties and service records.</p><Link className='button primary' href='/portal/customer'>Open customer workspace</Link></article>{providerOrgs.map(m=><article key={m.organisations!.id}><span>Electrical business</span><h2>{m.organisations!.name}</h2><p>Work offers, compliance, coverage, verification and performance.</p><Link className='button primary' href={`/portal/provider?organisation=${m.organisations!.id}`}>Open contractor portal</Link></article>)}{businessOrgs.map(m=><article key={m.organisations!.id}><span>Business client</span><h2>{m.organisations!.name}</h2><p>Portfolio jobs, properties, compliance and reporting.</p><Link className='button primary' href={`/portal/business?organisation=${m.organisations!.id}`}>Open business portal</Link></article>)}{educationOrgs.map(m=><article key={m.organisations!.id}><span>Education partner</span><h2>{m.organisations!.name}</h2><p>Employer engagement, placements and Academy activity.</p><Link className='button primary' href={`/portal/academy?organisation=${m.organisations!.id}`}>Open Academy workspace</Link></article>)}</div>{typedMemberships.length===0&&<p className='note'>No organisation workspace is linked yet. Your customer workspace is still available; verified provider and business memberships appear here when onboarding is completed.</p>}</section>;
}
