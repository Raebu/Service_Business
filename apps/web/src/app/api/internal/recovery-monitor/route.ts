import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const NO_SHOW_GRACE_MINUTES=20;
const OVERRUN_GRACE_MINUTES=30;
const BATCH=100;

function minutesSince(value:string|null){return value?Math.max(0,(Date.now()-new Date(value).getTime())/60_000):0}

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const now=new Date();
    const {data:jobs,error}=await supabase.from('jobs')
      .select('id,status,requested_start,requested_end,estimated_duration_minutes,arrived_at,work_started_at,completed_at,last_progress_at,assigned_engineer_id,provider_id,corporate_sla_id,operational_risk_state,payment_status,settlement_status')
      .in('status',['accepted','scheduled','in_progress'])
      .not('requested_start','is',null)
      .order('requested_start',{ascending:true}).limit(BATCH);
    if(error)return NextResponse.json({error:'Unable to load operational jobs.',detail:error.message},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const job of jobs||[]){
      const start=new Date(job.requested_start as string);
      const expectedEnd=job.requested_end?new Date(job.requested_end):new Date(start.getTime()+Number(job.estimated_duration_minutes||60)*60_000);
      if(now.getTime()>start.getTime()+NO_SHOW_GRACE_MINUTES*60_000&&!job.arrived_at&&!job.work_started_at){
        const evidence={requestedStart:job.requested_start,graceMinutes:NO_SHOW_GRACE_MINUTES,assignedEngineerId:job.assigned_engineer_id,lastProgressAt:job.last_progress_at};
        const {data:signal}=await supabase.from('recovery_signals').upsert({job_id:job.id,signal_type:'no_show',severity:'high',evidence,status:'open'},{onConflict:'job_id,signal_type,status'}).select('id').maybeSingle();
        await supabase.from('jobs').update({operational_risk_state:'no_show_risk',settlement_status:'blocked',updated_at:new Date().toISOString()}).eq('id',job.id);
        const {data:existing}=await supabase.from('job_cases').select('id').eq('job_id',job.id).eq('case_type','complaint').eq('policy_code','no_show_reassign').in('status',['open','pending']).maybeSingle();
        if(!existing){
          await supabase.from('job_cases').insert({job_id:job.id,case_type:'complaint',status:'open',policy_code:'no_show_reassign',automation_state:'eligible',summary:'Provider no-show detected automatically from appointment telemetry.',details:JSON.stringify(evidence)});
        }
        await supabase.from('job_progress_events').insert({job_id:job.id,engineer_id:job.assigned_engineer_id,event_type:'no_show_detected',source:'recovery_monitor',metadata:evidence});
        results.push({jobId:job.id,signalId:signal?.id,status:'no_show_detected'});continue;
      }
      if(job.work_started_at&&!job.completed_at&&now.getTime()>expectedEnd.getTime()+OVERRUN_GRACE_MINUTES*60_000){
        const evidence={expectedEnd:expectedEnd.toISOString(),graceMinutes:OVERRUN_GRACE_MINUTES,startedAt:job.work_started_at,lastProgressAt:job.last_progress_at};
        await supabase.from('recovery_signals').upsert({job_id:job.id,signal_type:'overrun',severity:'medium',evidence,status:'open'},{onConflict:'job_id,signal_type,status'});
        await supabase.from('jobs').update({operational_risk_state:'overrun_risk',updated_at:new Date().toISOString()}).eq('id',job.id);
        await supabase.from('job_progress_events').insert({job_id:job.id,engineer_id:job.assigned_engineer_id,event_type:'overrun_detected',source:'recovery_monitor',metadata:evidence});
        results.push({jobId:job.id,status:'overrun_detected'});continue;
      }
      if(job.operational_risk_state!=='normal'&&(job.arrived_at||job.completed_at))await supabase.from('jobs').update({operational_risk_state:'normal',updated_at:new Date().toISOString()}).eq('id',job.id);
    }
    return NextResponse.json({processed:jobs?.length||0,signals:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Recovery monitor failed.'},{status:500});
  }
}
