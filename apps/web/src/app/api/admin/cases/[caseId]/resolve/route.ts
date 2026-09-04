import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({resolution:z.string().trim().min(8).max(5000),jobStatus:z.enum(['completed','cancelled','disputed']).optional()});

export async function POST(request:Request,{params}:{params:Promise<{caseId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Resolution details are required.'},{status:400});
  try{
    const {caseId}=await params;
    const supabase=getAdminSupabase();
    const {data:record}=await supabase.from('job_cases').select('id,job_id,status').eq('id',caseId).maybeSingle();
    if(!record)return NextResponse.json({error:'Case not found.'},{status:404});
    const now=new Date().toISOString();
    const {error}=await supabase.from('job_cases').update({status:'resolved',resolution:parsed.data.resolution,resolved_at:now,updated_at:now}).eq('id',caseId);
    if(error)return NextResponse.json({error:'Unable to resolve case.',detail:error.message},{status:409});
    if(parsed.data.jobStatus)await supabase.from('jobs').update({status:parsed.data.jobStatus,updated_at:now}).eq('id',record.job_id);
    await supabase.from('audit_events').insert({actor_user_id:admin.user.id,event_type:'job_case.resolved',entity_type:'job_case',entity_id:caseId,metadata:{jobId:record.job_id,jobStatus:parsed.data.jobStatus||null}});
    return NextResponse.json({ok:true,caseId,status:'resolved'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to resolve case.'},{status:500});
  }
}
