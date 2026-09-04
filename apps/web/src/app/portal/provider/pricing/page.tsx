import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { PricingEditor } from './PricingEditor';

export const dynamic='force-dynamic';

export default async function ProviderPricingPage({searchParams}:{searchParams:Promise<{organisation?:string}>}){
  const {organisation}=await searchParams;if(!organisation)redirect('/account');
  const supabase=await getUserSupabase();if(!supabase)redirect('/account');
  const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/account');
  const [{data:membership},{data:org}]=await Promise.all([
    supabase.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle(),
    supabase.from('organisations').select('id,name,kind').eq('id',organisation).maybeSingle()
  ]);
  if(!membership||!org||org.kind!=='provider_business')redirect('/account');
  const {data:cards}=await supabase.from('provider_rate_cards').select('id,name,version,currency,effective_from').eq('organisation_id',organisation).eq('active',true).order('version',{ascending:false});
  const cardIds=(cards||[]).map(c=>c.id);
  const {data:items}=cardIds.length?await supabase.from('provider_rate_items').select('id,rate_card_id,service_key,pricing_mode,fixed_price_pence,callout_pence,hourly_pence,minimum_charge_pence,estimated_duration_minutes,emergency_multiplier,travel_rules').in('rate_card_id',cardIds).eq('active',true).order('service_key'):{data:[] as Array<Record<string,unknown>>};
  const canManage=['owner','admin','manager'].includes(membership.role);
  const money=(pence:number|null)=>pence==null?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Provider pricing</span><h1>Prices you control.</h1><p className='lede'>Your business defines the underlying price. The platform adds its customer service fee separately, so there is no hidden contractor deduction.</p></div><div className='actions'><Link className='button' href={`/portal/provider?organisation=${organisation}`}>Back to contractor portal</Link><Link className='button' href={`/portal/provider/team?organisation=${organisation}`}>Team</Link></div></div><div className='split'><section className='portal-card'><h2>Current rate card</h2>{!items?.length?<p>No rates configured yet.</p>:items.map(item=><article className='record-row' key={String(item.id)}><div><strong>{String(item.service_key)}</strong><span>{String(item.pricing_mode)} · {item.pricing_mode==='hourly'?`${money(Number(item.hourly_pence))}/hr`:money(Number(item.fixed_price_pence))} · call-out {money(Number(item.callout_pence))} · min {money(Number(item.minimum_charge_pence))}</span></div><span className='status-pill'>{item.estimated_duration_minutes?`${item.estimated_duration_minutes} min`:'duration unset'}</span></article>)}</section>{canManage?<PricingEditor organisationId={organisation}/>:<section className='portal-card'><h2>Read-only pricing</h2><p>Only a business owner or manager can change the rate card.</p></section>}</div><p className='note'>Current standard marketplace policy is a 15% customer-funded service fee. The provider price is not reduced by that fee. If a minimum or cap is later adopted, it will be a published platform rule rather than personalised hidden pricing.</p></section>;
}
