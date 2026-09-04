import { NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyElectricalService } from '@service-business/electrical';
import { postcodeArea } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { haversineMeters, routeEta } from '@/lib/routing';

const DAY_INDEX:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
const schema=z.object({
  postcode:z.string().trim().min(2).max(12),
  description:z.string().trim().min(8).max(5000),
  serviceKey:z.string().trim().max(120).optional().or(z.literal('')),
  requestedStart:z.string().datetime({offset:true}),
  requestedEnd:z.string().datetime({offset:true}).optional().or(z.literal('')),
  latitude:z.coerce.number().min(-90).max(90).optional(),
  longitude:z.coerce.number().min(-180).max(180).optional()
}).superRefine((value,ctx)=>{
  if((value.latitude==null)!==(value.longitude==null))ctx.addIssue({code:'custom',path:['latitude'],message:'Coordinates must be supplied together.'});
  if(value.requestedEnd&&new Date(value.requestedEnd)<=new Date(value.requestedStart))ctx.addIssue({code:'custom',path:['requestedEnd'],message:'End must be after start.'});
});

type Availability={engineer_id:string;day_of_week:number;start_time:string;end_time:string;maximum_travel_minutes:number|null;buffer_before_minutes:number;buffer_after_minutes:number;maximum_jobs_per_day:number|null;allowed_service_keys:string[]};
type BusyJob={assigned_engineer_id:string;requested_start:string|null;requested_end:string|null;estimated_duration_minutes:number|null};

function londonDayAndTime(date:Date){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const value=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return{day:DAY_INDEX[value('weekday')],time:`${value('hour')}:${value('minute')}`};
}
function overlaps(start:Date,end:Date,busy:BusyJob,bufferBefore:number,bufferAfter:number){
  if(!busy.requested_start)return false;
  const busyStart=new Date(new Date(busy.requested_start).getTime()-bufferBefore*60_000);
  const rawEnd=busy.requested_end?new Date(busy.requested_end):new Date(new Date(busy.requested_start).getTime()+Number(busy.estimated_duration_minutes||60)*60_000);
  const busyEnd=new Date(rawEnd.getTime()+bufferAfter*60_000);
  return start<busyEnd&&busyStart<end;
}

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the requested time and location.'},{status:400});
  const input=parsed.data;
  try{
    const supabase=getAdminSupabase();
    const area=postcodeArea(input.postcode);
    const serviceKey=input.serviceKey||classifyElectricalService(input.description);
    const requestedStart=new Date(input.requestedStart);
    const requestedEnd=input.requestedEnd?new Date(input.requestedEnd):new Date(requestedStart.getTime()+60*60_000);
    const local=londonDayAndTime(requestedStart);

    const {data:liveArea}=await supabase.from('service_areas').select('status').eq('vertical_id','electrical').eq('area',area).maybeSingle();
    if(!liveArea||liveArea.status!=='live')return NextResponse.json({available:false,area,serviceKey,reason:'coverage_not_live',message:'Verified electrician coverage is not live in this area yet.'},{status:200});

    const {data:coverage}=await supabase.from('provider_coverage').select('provider_id').eq('area',area).eq('active',true);
    const providerIds=(coverage||[]).map(row=>row.provider_id);
    if(!providerIds.length)return NextResponse.json({available:false,area,serviceKey,reason:'no_provider_coverage',message:'No verified provider currently covers this area.'},{status:200});

    const [{data:providers},{data:serviceRows}]=await Promise.all([
      supabase.from('providers').select('id,organisation_id').in('id',providerIds).eq('verification_state','active'),
      supabase.from('provider_services').select('provider_id').in('provider_id',providerIds).eq('service_key',serviceKey).eq('active',true)
    ]);
    const serviceProviderIds=new Set((serviceRows||[]).map(row=>row.provider_id));
    const eligibleProviders=(providers||[]).filter(provider=>serviceProviderIds.has(provider.id));
    const organisationIds=[...new Set(eligibleProviders.map(provider=>provider.organisation_id))];
    if(!organisationIds.length)return NextResponse.json({available:false,area,serviceKey,reason:'no_service_provider',message:'No verified electrician with this service is currently available in the area.'},{status:200});

    const [{data:engineers},{data:organisations}]=await Promise.all([
      supabase.from('engineers').select('id,organisation_id,status,can_work_unsupervised').in('organisation_id',organisationIds).eq('status','active').eq('can_work_unsupervised',true),
      supabase.from('organisations').select('id,base_latitude,base_longitude,default_service_radius_km').in('id',organisationIds)
    ]);
    const engineerIds=(engineers||[]).map(engineer=>engineer.id);
    if(!engineerIds.length)return NextResponse.json({available:false,area,serviceKey,reason:'no_qualified_engineer',message:'No independently deployable electrician is available for this request.'},{status:200});

    const [{data:rules},{data:busyJobs}]=await Promise.all([
      supabase.from('engineer_availability_rules').select('engineer_id,day_of_week,start_time,end_time,maximum_travel_minutes,buffer_before_minutes,buffer_after_minutes,maximum_jobs_per_day,allowed_service_keys').in('engineer_id',engineerIds).eq('active',true).eq('day_of_week',local.day),
      supabase.from('jobs').select('assigned_engineer_id,requested_start,requested_end,estimated_duration_minutes').in('assigned_engineer_id',engineerIds).in('status',['accepted','scheduled','in_progress'])
    ]);

    let routeAwareCandidates=0;
    let scheduleCandidates=0;
    for(const engineer of engineers||[]){
      const matching=(rules||[]).find((rule:Availability)=>rule.engineer_id===engineer.id&&rule.start_time.slice(0,5)<=local.time&&rule.end_time.slice(0,5)>=local.time&&(!rule.allowed_service_keys?.length||rule.allowed_service_keys.includes(serviceKey)));
      if(!matching)continue;
      const blockedStart=new Date(requestedStart.getTime()-Number(matching.buffer_before_minutes||0)*60_000);
      const blockedEnd=new Date(requestedEnd.getTime()+Number(matching.buffer_after_minutes||0)*60_000);
      const engineerBusy=(busyJobs||[]).filter(job=>job.assigned_engineer_id===engineer.id) as BusyJob[];
      if(engineerBusy.some(job=>overlaps(blockedStart,blockedEnd,job,0,0)))continue;
      if(matching.maximum_jobs_per_day){
        const jobsToday=engineerBusy.filter(job=>job.requested_start&&londonDayAndTime(new Date(job.requested_start)).day===local.day).length;
        if(jobsToday>=matching.maximum_jobs_per_day)continue;
      }
      scheduleCandidates++;

      if(input.latitude!=null&&input.longitude!=null){
        const org=(organisations||[]).find(row=>row.id===engineer.organisation_id);
        if(org?.base_latitude==null||org?.base_longitude==null)continue;
        const origin={latitude:Number(org.base_latitude),longitude:Number(org.base_longitude)};
        const destination={latitude:Number(input.latitude),longitude:Number(input.longitude)};
        const coarse=haversineMeters(origin,destination);
        if(org.default_service_radius_km&&coarse>Number(org.default_service_radius_km)*1000)continue;
        const routed=await routeEta(origin,destination);
        if(matching.maximum_travel_minutes&&routed&&routed.durationSeconds>matching.maximum_travel_minutes*60)continue;
        if(routed)routeAwareCandidates++;
      }
    }

    const available=input.latitude!=null&&input.longitude!=null?routeAwareCandidates>0:scheduleCandidates>0;
    const routeAware=input.latitude!=null&&input.longitude!=null&&routeAwareCandidates>0;
    return NextResponse.json({
      available,
      area,
      serviceKey,
      scheduleCandidates,
      routeAwareCandidates,
      routeAware,
      message:available
        ? routeAware?'This requested time currently has at least one verified electrician who passes schedule and route checks. Final booking is confirmed only after dispatch acceptance.':'This requested time currently has at least one verified electrician who passes schedule checks. Add location to include route feasibility before submission.'
        :'No eligible electrician currently passes the requested schedule and travel constraints. Choose another time or submit as flexible.'
    });
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production availability is not configured.'},{status:503});
    return NextResponse.json({error:'Unable to check live availability.'},{status:500});
  }
}
