import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;

export async function GET(request:Request){
 const url=new URL(request.url);const organisation=url.searchParams.get('organisation');if(!organisation)return NextResponse.json({error:'organisation is required'},{status:400});
 const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const {data:membership}=await userDb.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle();if(!membership)return NextResponse.json({error:'Access denied.'},{status:403});
 try{const admin=getAdminSupabase();const {data:provider}=await admin.from('providers').select('id').eq('organisation_id',organisation).maybeSingle();if(!provider)return NextResponse.json({error:'Provider not found.'},{status:404});
 const {data:jobs}=await admin.from('jobs').select('id,created_at,postcode,status,provider_price_pence,platform_fee_pence,customer_total_pence,payment_status,settlement_status,stripe_processing_fee_pence,net_platform_margin_pence,stripe_transfer_id').eq('matched_provider_id',provider.id).order('created_at',{ascending:true});
 const jobIds=(jobs||[]).map(j=>j.id);const [{data:adjustments},{data:reserves}]=await Promise.all([
  jobIds.length?admin.from('payment_adjustments').select('job_id,adjustment_type,amount_pence,reason,status,created_at').in('job_id',jobIds).order('created_at',{ascending:true}):Promise.resolve({data:[]}),
  admin.from('provider_reserve_holds').select('job_id,amount_pence,status,reason,release_at,released_at,created_at').eq('provider_id',provider.id).order('created_at',{ascending:true})
 ]);
 const rows=['record_type,date,job_id,postcode,job_status,provider_entitlement_pence,platform_fee_pence,customer_total_pence,payment_status,settlement_status,stripe_fee_pence,platform_margin_pence,adjustment_type,adjustment_pence,adjustment_reason,reserve_status,reserve_pence,reserve_release_at'];
 for(const j of jobs||[]){rows.push(['job',j.created_at,j.id,j.postcode,j.status,j.provider_price_pence,j.platform_fee_pence,j.customer_total_pence,j.payment_status,j.settlement_status,j.stripe_processing_fee_pence,j.net_platform_margin_pence,'','','','','',''].map(esc).join(','));for(const a of (adjustments||[]).filter(x=>x.job_id===j.id))rows.push(['adjustment',a.created_at,j.id,j.postcode,j.status,'','','',j.payment_status,j.settlement_status,'','',a.adjustment_type,a.amount_pence,a.reason,'','',''].map(esc).join(','));for(const h of (reserves||[]).filter(x=>x.job_id===j.id))rows.push(['reserve',h.created_at,j.id,j.postcode,j.status,'','','',j.payment_status,j.settlement_status,'','','','',h.reason,h.status,h.amount_pence,h.released_at||h.release_at].map(esc).join(','))}
 const body=rows.join('\n');return new NextResponse(body,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="provider-finance-${organisation}.csv"`,'cache-control':'no-store'}})
 }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Unable to generate statement.'},{status:500})}
}
