import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const escapeXml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]||char));

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  try{
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.from('public_provider_verification').select('business_name,verification_state,next_evidence_expiry').eq('public_slug',slug).maybeSingle();
    if(error||!data)return new Response('Verification record not found.',{status:404,headers:{'content-type':'text/plain; charset=utf-8'}});
    const nextExpiry=data.next_evidence_expiry?Date.parse(data.next_evidence_expiry):null;
    const active=data.verification_state==='active'&&(!nextExpiry||nextExpiry>Date.now());
    const state=active?'VERIFIED NETWORK MEMBER':'VERIFICATION INACTIVE';
    const accent=active?'#0066ff':'#667085';
    const business=escapeXml(data.business_name);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="92" role="img" aria-label="National Electrician Hub ${state}">
      <rect width="360" height="92" rx="18" fill="#ffffff"/>
      <rect x="1" y="1" width="358" height="90" rx="17" fill="none" stroke="#dfe3e8"/>
      <rect x="16" y="16" width="60" height="60" rx="16" fill="#0b132b"/>
      <text x="46" y="52" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#ffffff">NEH</text>
      <text x="92" y="32" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#0b132b">National Electrician Hub</text>
      <text x="92" y="51" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="${accent}">${state}</text>
      <text x="92" y="70" font-family="Arial,sans-serif" font-size="10" fill="#667085">${business}</text>
    </svg>`;
    return new Response(svg,{status:200,headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=300, stale-while-revalidate=300','x-content-type-options':'nosniff'}});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return new Response('Verification service unavailable.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
    return new Response('Unable to render verification badge.',{status:500,headers:{'content-type':'text/plain; charset=utf-8'}});
  }
}
