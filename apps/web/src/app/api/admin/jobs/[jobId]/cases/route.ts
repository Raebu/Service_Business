import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({
  caseType:z.enum(['complaint','dispute','rework','refund','safety','other']),
  priority:z.enum(['low','normal','high','critical']).default('normal'),
  summary:z.string().trim().min(8).max(5000),
  dueAt:z.string().datetime().optional()
});

export async function POST(request:Request,{params}:{params:Promise<{jobId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid case details.'},{status:400});
  try{
    const {jobId}=await params;
    const supabase=getAdminSupabase();
    const {data:job}=await supabase.from('jobs').select('id,status').eq('id',jobId).maybeSingle();
    if(!job)return NextResponse.json({error:'Job not found.'},{status:404});
    const {data,error}=await supabase.from('job_cases').insert({
      job_id:jobId,case_type:parsed.data.caseType,priority:parsed.data.priority,summary:parsed.data.summary,
      opened_by:admin.user.id,due_at:parsed.data.dueAt||null
    }).select('id,status').single();
    if(error)return NextResponse.json({error:'Unable to create case.',detail:error.message},{status:409});
    if(['dispute','refund','safety'].includes(parsed.data.caseType))await supabase.from('jobs').update({status:'disputed',updated_at:new Date().toISOString()}).eq('id',jobId);
    await supabase.from('audit_events').insert({actor_user_id:admin.user.id,event_type:'job_case.created',entity_type:'job',entity_id:jobId,metadata:{caseId:data.id,caseType:parsed.data.caseType,priority:parsed.data.priority}});
    return NextResponse.json({ok:true,caseId:data.id,status:data.status});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to create case.'},{status:500});
  }
}
