import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({policyCode:z.string().trim().min(3).max(120),refundPence:z.coerce.number().int().positive().optional()});

export async function POST(request:Request,{params}:{params:Promise<{caseId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'A valid recovery policy is required.'},{status:400});
  try{
    const {caseId}=await params;const supabase=getAdminSupabase();
    const [{data:record},{data:policy}]=await Promise.all([
      supabase.from('job_cases').select('id,job_id,case_type,status,automation_state').eq('id',caseId).maybeSingle(),
      supabase.from('service_recovery_policies').select('code,case_type,action,refund_percent,active').eq('code',parsed.data.policyCode).eq('active',true).maybeSingle()
    ]);
    if(!record)return NextResponse.json({error:'Case not found.'},{status:404});
    if(!policy)return NextResponse.json({error:'Recovery policy is unavailable.'},{status:404});
    if(record.status==='resolved'||record.status==='closed')return NextResponse.json({error:'Resolved cases cannot be re-automated.'},{status:409});
    if(record.case_type!==policy.case_type)return NextResponse.json({error:'Recovery policy does not match this case type.'},{status:409});
    if(policy.action==='refund_partial'&&parsed.data.refundPence==null&&policy.refund_percent==null)return NextResponse.json({error:'A partial refund amount is required for this policy.'},{status:400});
    const now=new Date().toISOString();
    const {error}=await supabase.from('job_cases').update({policy_code:policy.code,automation_state:'eligible',automation_action:policy.action,refund_pence:parsed.data.refundPence??null,automation_error:null,updated_at:now}).eq('id',caseId);
    if(error)return NextResponse.json({error:'Unable to queue recovery automation.',detail:error.message},{status:409});
    await supabase.from('jobs').update({settlement_status:'blocked',updated_at:now}).eq('id',record.job_id).neq('settlement_status','transferred');
    await supabase.from('audit_events').insert({actor_user_id:admin.user.id,event_type:'job_case.automation_approved',entity_type:'job_case',entity_id:caseId,metadata:{jobId:record.job_id,policyCode:policy.code,action:policy.action,refundPence:parsed.data.refundPence??null}});
    return NextResponse.json({ok:true,caseId,policyCode:policy.code,action:policy.action,automationState:'eligible'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to queue recovery automation.'},{status:500});
  }
}
