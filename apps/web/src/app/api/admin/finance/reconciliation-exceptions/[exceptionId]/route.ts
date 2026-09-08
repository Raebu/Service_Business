import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({status:z.enum(['resolved','ignored']),reason:z.string().trim().min(3).max(1000)});

export async function PATCH(request:Request,{params}:{params:Promise<{exceptionId:string}>}){
  const session=await getAdminSession();
  if(!session)return NextResponse.json({error:'Admin access required.'},{status:403});
  const {exceptionId}=await params;
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Choose a final status and give an audit reason.'},{status:400});
  try{
    const db=getAdminSupabase();
    const {data:existing}=await db.from('finance_reconciliation_exceptions').select('id,organisation_id,job_id,source,source_id,exception_type,status,details').eq('id',exceptionId).maybeSingle();
    if(!existing)return NextResponse.json({error:'Finance exception not found.'},{status:404});
    if(!['open','investigating'].includes(existing.status))return NextResponse.json({error:'This exception is already final.'},{status:409});
    const resolvedAt=new Date().toISOString();
    const details={...(existing.details&&typeof existing.details==='object'?existing.details:{}),resolution:{status:parsed.data.status,reason:parsed.data.reason,resolvedBy:session.user.id,resolvedAt}};
    const {data,error}=await db.from('finance_reconciliation_exceptions').update({status:parsed.data.status,resolved_at:resolvedAt,details}).eq('id',exceptionId).in('status',['open','investigating']).select('id,status,resolved_at').maybeSingle();
    if(error)return NextResponse.json({error:'Unable to resolve finance exception.',detail:error.message},{status:500});
    if(!data)return NextResponse.json({error:'The exception changed before this action completed. Refresh and try again.'},{status:409});
    await db.from('audit_events').insert({actor_user_id:session.user.id,event_type:'finance.reconciliation_exception_finalised',entity_type:'finance_reconciliation_exception',entity_id:exceptionId,metadata:{organisationId:existing.organisation_id,jobId:existing.job_id,source:existing.source,sourceId:existing.source_id,exceptionType:existing.exception_type,previousStatus:existing.status,status:parsed.data.status,reason:parsed.data.reason}});
    return NextResponse.json({exception:data,message:parsed.data.status==='resolved'?'Exception marked resolved.':'Exception ignored with an audit reason.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to resolve finance exception.'},{status:500});
  }
}
