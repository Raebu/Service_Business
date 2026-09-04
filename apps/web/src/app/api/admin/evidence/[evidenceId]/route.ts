import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({status:z.enum(['verified','rejected']),expiresAt:z.string().optional().nullable(),reason:z.string().trim().max(1000).optional()});

export async function POST(request:Request,{params}:{params:Promise<{evidenceId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid evidence decision.'},{status:400});
  try{
    const {evidenceId}=await params;const supabase=getAdminSupabase();
    const {data:evidence}=await supabase.from('provider_evidence').select('id,provider_id,kind,label,status').eq('id',evidenceId).maybeSingle();
    if(!evidence)return NextResponse.json({error:'Evidence not found.'},{status:404});
    const update={status:parsed.data.status,verified_at:parsed.data.status==='verified'?new Date().toISOString():null,expires_at:parsed.data.expiresAt||null};
    const {error}=await supabase.from('provider_evidence').update(update).eq('id',evidenceId);
    if(error)return NextResponse.json({error:'Unable to update evidence.',detail:error.message},{status:409});
    if(parsed.data.status==='rejected'&&['business_identity','qualification','scheme_membership','insurance'].includes(evidence.kind)){
      await supabase.rpc('set_provider_status',{p_provider_id:evidence.provider_id,p_new_state:'suspended',p_reason:parsed.data.reason||`Required evidence rejected: ${evidence.label}`,p_actor_user_id:admin.user.id});
    }
    await supabase.from('audit_events').insert({actor_user_id:admin.user.id,event_type:`provider_evidence.${parsed.data.status}`,entity_type:'provider_evidence',entity_id:evidenceId,metadata:{providerId:evidence.provider_id,reason:parsed.data.reason||null}});

    const {data:provider}=await supabase.from('providers').select('application_id').eq('id',evidence.provider_id).maybeSingle();
    if(provider?.application_id){
      const {data:application}=await supabase.from('provider_applications').select('email,contact_name,business_name').eq('id',provider.application_id).maybeSingle();
      if(application?.email){
        await supabase.rpc('queue_notification_once',{
          p_dedupe_key:`provider.evidence_${parsed.data.status}:${evidenceId}:${parsed.data.expiresAt||'none'}`,
          p_recipient_user_id:null,
          p_recipient_email:application.email,
          p_channel:'email',
          p_template_key:parsed.data.status==='verified'?'provider.evidence_verified':'provider.evidence_rejected',
          p_payload:{evidenceId,label:evidence.label||evidence.kind,expiresAt:parsed.data.expiresAt||null,reason:parsed.data.reason||null,businessName:application.business_name,contactName:application.contact_name},
          p_scheduled_at:new Date().toISOString()
        });
      }
    }
    return NextResponse.json({ok:true,evidenceId,status:parsed.data.status});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to update evidence.'},{status:500});
  }
}

export async function GET(_:Request,{params}:{params:Promise<{evidenceId:string}>}){
  const admin=await getAdminSession();if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const {evidenceId}=await params;const supabase=getAdminSupabase();
    const {data:evidence}=await supabase.from('provider_evidence').select('storage_path,file_name').eq('id',evidenceId).maybeSingle();
    if(!evidence?.storage_path)return NextResponse.json({error:'No uploaded file is attached to this evidence record.'},{status:404});
    const {data,error}=await supabase.storage.from('provider-evidence').createSignedUrl(evidence.storage_path,300);
    if(error||!data)return NextResponse.json({error:'Unable to open evidence file.'},{status:409});
    return NextResponse.json({url:data.signedUrl,fileName:evidence.file_name||'evidence'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to open evidence file.'},{status:500});
  }
}
