import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';
import { haversineMeters,routeEta,type Coordinate } from '@/lib/routing';

type Job={
  id:string;
  assigned_engineer_id:string|null;
  requested_start:string|null;
  requested_end:string|null;
  latitude:number|null;
  longitude:number|null;
  estimated_duration_minutes:number|null;
  postcode:string|null;
  schedule_mode:'asap'|'exact'|'window'|'flexible'|null;
  service_key:string|null;
};
type AvailabilityRule={engineer_id:string;day_of_week:number;start_time:string;end_time:string;buffer_before_minutes:number|null;buffer_after_minutes:number|null;maximum_jobs_per_day:number|null;allowed_service_keys:string[]|null};
type TimeOff={engineer_id:string;starts_at:string;ends_at:string};
type Occupied={jobId:string;start:Date;end:Date;latitude:number|null;longitude:number|null;fixed:boolean};
const DAY_INDEX:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};

async function travel(a:Coordinate,b:Coordinate){
  const routed=await routeEta(a,b);
  const coarse=haversineMeters(a,b);
  return routed?{seconds:routed.durationSeconds,meters:routed.distanceMeters,source:routed.source}:{seconds:Math.round(coarse/8.33),meters:coarse,source:'coarse-fallback'};
}
function londonParts(date:Date){
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  const parts=fmt.formatToParts(date);const value=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return{day:DAY_INDEX[value('weekday')],time:`${value('hour')}:${value('minute')}`};
}
function overlaps(aStart:Date,aEnd:Date,bStart:Date,bEnd:Date){return aStart<bEnd&&bStart<aEnd}
function jobDuration(job:Job){return Math.max(30,Math.min(480,Number(job.estimated_duration_minutes||60)))}
function fixedInterval(job:Job):Occupied|null{
  if(!job.requested_start)return null;
  const start=new Date(job.requested_start);const end=new Date(start.getTime()+jobDuration(job)*60_000);
  return{jobId:job.id,start,end,latitude:job.latitude,longitude:job.longitude,fixed:true};
}
function coord(item:{latitude:number|null;longitude:number|null}):Coordinate|null{return item.latitude==null||item.longitude==null?null:{latitude:Number(item.latitude),longitude:Number(item.longitude)}}

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const body=await request.json().catch(()=>({}));
    const serviceDate=typeof body.serviceDate==='string'?body.serviceDate:new Date().toISOString().slice(0,10);
    const organisationId=typeof body.organisationId==='string'?body.organisationId:null;
    const admin=getAdminSupabase();
    let query=admin.from('jobs').select('id,assigned_engineer_id,requested_start,requested_end,latitude,longitude,estimated_duration_minutes,postcode,matched_provider_id,schedule_mode,service_key').gte('requested_start',`${serviceDate}T00:00:00`).lt('requested_start',`${serviceDate}T23:59:59.999`).not('assigned_engineer_id','is',null).in('status',['accepted','scheduled']);
    if(organisationId){
      const {data:provider}=await admin.from('providers').select('id').eq('organisation_id',organisationId).maybeSingle();
      if(!provider)return NextResponse.json({error:'Provider not found.'},{status:404});
      query=query.eq('matched_provider_id',provider.id);
    }
    const {data,error}=await query;if(error)return NextResponse.json({error:'Unable to load scheduled jobs.'},{status:500});
    const jobs=(data||[]) as Job[];
    const grouped=new Map<string,Job[]>();
    for(const job of jobs){if(!job.assigned_engineer_id)continue;const list=grouped.get(job.assigned_engineer_id)||[];list.push(job);grouped.set(job.assigned_engineer_id,list)}
    const engineerIds=[...grouped.keys()];
    const [{data:rulesData},{data:timeOffData}]=engineerIds.length?await Promise.all([
      admin.from('engineer_availability_rules').select('engineer_id,day_of_week,start_time,end_time,buffer_before_minutes,buffer_after_minutes,maximum_jobs_per_day,allowed_service_keys').in('engineer_id',engineerIds).eq('active',true),
      admin.from('engineer_time_off').select('engineer_id,starts_at,ends_at').in('engineer_id',engineerIds).lte('starts_at',`${serviceDate}T23:59:59.999`).gte('ends_at',`${serviceDate}T00:00:00`)
    ]):[{data:[]},{data:[]}];
    const rules=(rulesData||[]) as AvailabilityRule[];const timeOff=(timeOffData||[]) as TimeOff[];
    const plans:Array<Record<string,unknown>>=[];let baselineSeconds=0,optimisedSeconds=0;let flexibleJobs=0,slotSuggestions=0,unschedulable=0;

    for(const [engineerId,list] of grouped){
      const original=[...list].sort((a,b)=>String(a.requested_start).localeCompare(String(b.requested_start)));
      for(let i=1;i<original.length;i++){const a=coord(original[i-1]),b=coord(original[i]);if(a&&b)baselineSeconds+=(await travel(a,b)).seconds}

      const fixed:Occupied[]=original.filter(job=>!['window','flexible'].includes(job.schedule_mode||'')).reduce<Occupied[]>((items,job)=>{const interval=fixedInterval(job);if(interval)items.push(interval);return items},[]);
      const occupied:Occupied[]=[...fixed];
      const suggestions:Array<Record<string,unknown>>=[];
      const movable=original.filter(job=>['window','flexible'].includes(job.schedule_mode||''));
      flexibleJobs+=movable.length;

      for(const job of movable){
        if(!job.requested_start||!job.requested_end){unschedulable++;suggestions.push({jobId:job.id,status:'no_valid_window',reason:'A flexible/window job needs both requested_start and requested_end.'});continue}
        const windowStart=new Date(job.requested_start),windowEnd=new Date(job.requested_end),duration=jobDuration(job);
        if(windowEnd.getTime()-windowStart.getTime()<duration*60_000){unschedulable++;suggestions.push({jobId:job.id,status:'window_too_short',windowStart:job.requested_start,windowEnd:job.requested_end,durationMinutes:duration});continue}
        const candidates:Array<{start:Date;end:Date;score:number;travelSeconds:number;source:string}>=[];
        let scanned=0;
        for(let start=new Date(windowStart);start.getTime()+duration*60_000<=windowEnd.getTime()&&scanned<48;start=new Date(start.getTime()+15*60_000),scanned++){
          const end=new Date(start.getTime()+duration*60_000);const local=londonParts(start);const endLocal=londonParts(end);
          const rule=rules.find(r=>r.engineer_id===engineerId&&r.day_of_week===local.day&&r.start_time.slice(0,5)<=local.time&&r.end_time.slice(0,5)>=endLocal.time&&(!r.allowed_service_keys?.length||!job.service_key||r.allowed_service_keys.includes(job.service_key)));
          if(!rule)continue;
          const before=Number(rule.buffer_before_minutes||0),after=Number(rule.buffer_after_minutes||0);const blockedStart=new Date(start.getTime()-before*60_000),blockedEnd=new Date(end.getTime()+after*60_000);
          if(timeOff.some(off=>off.engineer_id===engineerId&&overlaps(blockedStart,blockedEnd,new Date(off.starts_at),new Date(off.ends_at))))continue;
          if(occupied.some(item=>overlaps(blockedStart,blockedEnd,item.start,item.end)))continue;
          if(rule.maximum_jobs_per_day&&original.length>Number(rule.maximum_jobs_per_day))continue;

          const chronological=[...occupied].sort((a,b)=>a.start.getTime()-b.start.getTime());
          const prev=[...chronological].reverse().find(item=>item.end<=start);const next=chronological.find(item=>item.start>=end);
          const jobCoord=coord(job);let travelSeconds=0;let source='no-route-evidence';
          if(jobCoord&&prev){const p=coord(prev);if(p){const leg=await travel(p,jobCoord);travelSeconds+=leg.seconds;source=leg.source}}
          if(jobCoord&&next){const n=coord(next);if(n){const leg=await travel(jobCoord,n);travelSeconds+=leg.seconds;source=source==='no-route-evidence'?leg.source:`${source}+${leg.source}`}}
          const centre=(windowStart.getTime()+windowEnd.getTime())/2;const centrePenalty=Math.abs((start.getTime()+end.getTime())/2-centre)/60000;
          candidates.push({start,end,score:travelSeconds+centrePenalty*2,travelSeconds,source});
        }
        candidates.sort((a,b)=>a.score-b.score||a.start.getTime()-b.start.getTime());const best=candidates[0];
        if(!best){unschedulable++;suggestions.push({jobId:job.id,status:'no_feasible_slot',windowStart:job.requested_start,windowEnd:job.requested_end,durationMinutes:duration,reason:'No candidate fits current working hours, service restrictions, buffers, time off, existing appointments and daily capacity.'});continue}
        occupied.push({jobId:job.id,start:best.start,end:best.end,latitude:job.latitude,longitude:job.longitude,fixed:false});slotSuggestions++;
        suggestions.push({jobId:job.id,status:'suggested',originalWindow:{start:job.requested_start,end:job.requested_end},suggestedStart:best.start.toISOString(),suggestedEnd:best.end.toISOString(),durationMinutes:duration,estimatedAdjacentTravelSeconds:best.travelSeconds,routeSource:best.source});
      }

      const proposed=[...occupied].sort((a,b)=>a.start.getTime()-b.start.getTime());
      for(let i=1;i<proposed.length;i++){const a=coord(proposed[i-1]),b=coord(proposed[i]);if(a&&b)optimisedSeconds+=(await travel(a,b)).seconds}
      plans.push({engineerId,originalJobOrder:original.map(j=>j.id),suggestedJobOrder:proposed.map(j=>j.jobId),suggestedSlots:suggestions,fixedAppointments:fixed.map(item=>item.jobId),jobCount:original.length});
    }

    const improvement=baselineSeconds>0?Math.max(0,(baselineSeconds-optimisedSeconds)/baselineSeconds):0;
    const {data:run}=await admin.from('schedule_optimisation_runs').insert({organisation_id:organisationId,service_date:serviceDate,status:'optimised',input_snapshot:{jobCount:jobs.length,engineerCount:grouped.size,baselineTravelSeconds:baselineSeconds,flexibleJobs},output_plan:{plans,optimisedTravelSeconds:optimisedSeconds,slotSuggestions,unschedulable,applyMode:'suggestion_only',constraints:['requested_window','working_hours','allowed_services','buffers','time_off','existing_appointments','maximum_jobs_per_day']},improvement_score:Number((improvement*100).toFixed(3))}).select('id').single();
    return NextResponse.json({runId:run?.id,serviceDate,jobs:jobs.length,engineers:grouped.size,flexibleJobs,slotSuggestions,unschedulable,baselineTravelSeconds:baselineSeconds,optimisedTravelSeconds:optimisedSeconds,estimatedImprovementPercent:Number((improvement*100).toFixed(1)),plans,note:'Optimisation is constraint-aware and suggestion-only. Exact appointments remain fixed and no customer booking is silently moved.'});
  }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Schedule optimisation failed.'},{status:500})}
}
