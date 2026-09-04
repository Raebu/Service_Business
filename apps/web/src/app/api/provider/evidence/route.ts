import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp']);

export async function POST(request:Request){
  const userClient=await getUserSupabase();
  if(!userClient)return NextResponse.json({error:'Authentication is not configured.'},{status:503});
  const {data:{user}}=await userClient.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const form=await request.formData();
  const organisationId=String(form.get('organisationId')||'');
  const kind=String(form.get('kind')||'');
  const label=String(form.get('label')||'').trim();
  const reference=String(form.get('reference')||'').trim();
  const expiresAt=String(form.get('expiresAt')||'').trim();
  const file=form.get('file');
  if(!organisationId||!['business_identity','qualification','scheme_membership','insurance','other'].includes(kind)||label.length<2||!(file instanceof File))return NextResponse.json({error:'Evidence details and a file are required.'},{status:400});
  if(file.size<=0||file.size>10*1024*1024)return NextResponse.json({error:'File must be between 1 byte and 10MB.'},{status:400});
  if(!allowed.has(file.type))return NextResponse.json({error:'Only PDF, JPEG, PNG and WebP evidence files are accepted.'},{status:400});

  const {data:membership}=await userClient.from('organisation_members').select('organisation_id').eq('organisation_id',organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership)return NextResponse.json({error:'You do not have access to this organisation.'},{status:403});
  const {data:provider}=await userClient.from('providers').select('id').eq('organisation_id',organisationId).maybeSingle();
  if(!provider)return NextResponse.json({error:'Provider record not found.'},{status:404});

  try{
    const admin=getAdminSupabase();
    const ext=file.name.includes('.')?file.name.split('.').pop()?.toLowerCase()||'bin':'bin';
    const storagePath=`${provider.id}/${randomUUID()}.${ext}`;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const {error:uploadError}=await admin.storage.from('provider-evidence').upload(storagePath,bytes,{contentType:file.type,upsert:false});
    if(uploadError)return NextResponse.json({error:'Evidence upload failed.',detail:uploadError.message},{status:409});
    const {data:record,error:insertError}=await admin.from('provider_evidence').insert({provider_id:provider.id,kind,label,reference:reference||null,storage_path:storagePath,status:'pending',expires_at:expiresAt||null,uploaded_by:user.id,file_name:file.name,mime_type:file.type,file_size:file.size}).select('id,status').single();
    if(insertError){await admin.storage.from('provider-evidence').remove([storagePath]);return NextResponse.json({error:'Unable to register evidence.',detail:insertError.message},{status:409});}
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'provider_evidence.uploaded',entity_type:'provider',entity_id:provider.id,metadata:{evidenceId:record.id,kind}});
    return NextResponse.json({ok:true,evidenceId:record.id,status:record.status});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Evidence upload failed.'},{status:500});
  }
}
