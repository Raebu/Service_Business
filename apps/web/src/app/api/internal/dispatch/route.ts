import { NextResponse } from 'next/server';
import { calculateProviderPrice,calculateTransparentQuote,rankProviders } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';
import { haversineMeters,routeEta,selectTravelCharge } from '@/lib/routing';

const BATCH_SIZE=25;
const DAY_INDEX:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};

type Engineer={id:string;organisation_id:string;available_now:boolean;can_work_unsupervised:boolean;status:string};
type Availability={engineer_id:string;day_of_week:number;start_time:string;end_time:string;auto_accept:boolean;minimum_job_pence:number;maximum_duration_minutes:number|null;maximum_travel_minutes:number|null;buffer_before_minutes:number;buffer_after_minutes:number;maximum_jobs_per_day:number|null;allowed_service_keys:string[]};
type BusyJob={assigned_engineer_id:string;requested_start:string|null;requested_end:string|null;estimated_duration_minutes:number|null;status:string};
type TravelBand={organisation_id:string;service_key:string|null;minimum_distance_meters:number;maximum_distance_meters:number|null;charge_pence:number;reject_beyond_band:boolean};
type DispatchOffer={offerId?:string;providerId:string;engineerId?:string;score?:number;expiresAt?:string;quote?:{providerPricePence:number;platformFeePence:number;customerTotalPence:number;providerReceivesPence:number;customerFeeBps:number;currency:'GBP'};autoAccept?:boolean;status?:string;distanceMeters?:number;durationSeconds?:number};

function londonDayAndTime(date:Date){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const value=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return{day:DAY_INDEX[value('weekday')],time:`${value('hour')}:${value('minute')}`};
}
function busyWindow(busy:BusyJob,bufferBefore:number,bufferAfter:number){
  if(!busy.requested_start)return null;
  const busyStart=new Date(new Date(busy.requested_start).getTime()-bufferBefore*60_000);
  const rawEnd=busy.requested_end?new Date(busy.requested_end):new Date(new Date(busy.requested_start).getTime()+(busy.estimated_duration_minutes||60)*60_000);
  return{start:busyStart,end:new Date(rawEnd.getTime()+bufferAfter*60_000)};
}
function overlaps(start:Date,end:Date,busy:BusyJob,bufferBefore:number,bufferAfter:number){
  const window=busyWindow(busy,bufferBefore,bufferAfter);return Boolean(window&&start<window.end&&window.start<end);
}
function legacyTravelCharge(travelRules:unknown){
  if(!Array.isArray(travelRules))return 0;
  const flat=travelRules.find((rule):rule is {type:string;amountPence:number}=>Boolean(rule&&typeof rule==='object'&&(rule as {type?:unknown}).type==='flat'));
  return flat&&Number.isFinite(Number(flat.amountPence))?Number(flat.amountPence):0;
}
function expirySeconds(urgency:string){return urgency==='emergency'?20:urgency==='urgent'?30:45}
function fanoutCount(urgency:string){return urgency==='emergency'?5:urgency==='urgent'?3:1}

function chooseEngineer(input:{engineers:Engineer[];rules:Availability[];busy:BusyJob[];scheduleMode:string;requestedStart:string|null;requestedEnd:string|null;durationMinutes:number;providerPricePence:number;serviceKey:string|null}){
  const now=new Date();
  const serviceStart=input.requestedStart?new Date(input.requestedStart):now;
  const serviceEnd=input.requestedEnd?new Date(input.requestedEnd):new Date(serviceStart.getTime()+input.durationMinutes*60_000);
  const local=londonDayAndTime(serviceStart);
  const candidates=input.engineers.flatMap(engineer=>{
    if(engineer.status!=='active'||!engineer.can_work_unsupervised)return [];
    const rules=input.rules.filter(rule=>rule.engineer_id===engineer.id&&rule.day_of_week===local.day&&(!rule.allowed_service_keys?.length||!input.serviceKey||rule.allowed_service_keys.includes(input.serviceKey)));
    if(input.scheduleMode==='asap'&&engineer.available_now&&rules.length===0)return [{engineer,rule:null as Availability|null}];
    const matching=rules.find(rule=>rule.start_time.slice(0,5)<=local.time&&rule.end_time.slice(0,5)>=local.time);
    if(!matching)return [];
    const startWithBuffer=new Date(serviceStart.getTime()-Number(matching.buffer_before_minutes||0)*60_000);
    const endWithBuffer=new Date(serviceEnd.getTime()+Number(matching.buffer_after_minutes||0)*60_000);
    if(input.busy.filter(job=>job.assigned_engineer_id===engineer.id).some(job=>overlaps(startWithBuffer,endWithBuffer,job,0,0)))return [];
    if(matching.maximum_jobs_per_day){
      const day=input.busy.filter(job=>job.assigned_engineer_id===engineer.id&&job.requested_start&&londonDayAndTime(new Date(job.requested_start)).day===local.day).length;
      if(day>=matching.maximum_jobs_per_day)return [];
    }
    return[{engineer,rule:matching}];
  });
  if(!candidates.length)return null;
  candidates.sort((a,b)=>Number(b.engineer.available_now)-Number(a.engineer.available_now)||a.engineer.id.localeCompare(b.engineer.id));
  const selected=candidates[0];
  const autoRule=selected.rule&&selected.rule.auto_accept&&input.providerPricePence>=Number(selected.rule.minimum_job_pence||0)&&(!selected.rule.maximum_duration_minutes||input.durationMinutes<=selected.rule.maximum_duration_minutes);
  return{engineer:selected.engineer,rule:selected.rule,autoRule:Boolean(autoRule)};
}

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    await supabase.rpc('expire_stale_job_offers');
    const {data:policy}=await supabase.from('platform_pricing_policies').select('customer_fee_bps,minimum_fee_pence,maximum_fee_pence').eq('vertical_id','electrical').eq('active',true).maybeSingle();
    const {data:jobs,error:jobsError}=await supabase.from('jobs').select('id,postcode,service_key,status,urgency,schedule_mode,requested_start,requested_end,estimated_duration_minutes,latitude,longitude').eq('status','new').order('created_at',{ascending:true}).limit(BATCH_SIZE);
    if(jobsError)return NextResponse.json({error:'Unable to load pending jobs.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const job of jobs||[]){
      const outward=(job.postcode||'').trim().toUpperCase().split(' ')[0]||'';
      const areaMatch=outward.match(/^[A-Z]{1,2}/)?.[0]||outward;
      const {data:coverage}=await supabase.from('provider_coverage').select('provider_id,priority').eq('area',areaMatch).eq('active',true);
      const providerIds=(coverage||[]).map(row=>row.provider_id);
      if(!providerIds.length){results.push({jobId:job.id,status:'no_eligible_provider'});continue}
      const [{data:providers},{data:triedOffers},{data:serviceRows}]=await Promise.all([
        supabase.from('providers').select('id,organisation_id,verification_state,available_now,quality_score,acceptance_rate,completion_rate,rework_rate').in('id',providerIds).eq('verification_state','active'),
        supabase.from('job_offers').select('provider_id').eq('job_id',job.id),
        job.service_key?supabase.from('provider_services').select('provider_id').in('provider_id',providerIds).eq('service_key',job.service_key).eq('active',true):Promise.resolve({data:providerIds.map(provider_id=>({provider_id}))})
      ]);
      const eligibleProviders=(providers||[]).filter(provider=>(serviceRows||[]).some(row=>row.provider_id===provider.id));
      const orgIds=[...new Set(eligibleProviders.map(p=>p.organisation_id))];
      if(!orgIds.length){results.push({jobId:job.id,status:'no_service_provider'});continue}
      const [{data:cards},{data:organisations},{data:travelBands}]=await Promise.all([
        supabase.from('provider_rate_cards').select('id,organisation_id,version').in('organisation_id',orgIds).eq('active',true).order('version',{ascending:false}),
        supabase.from('organisations').select('id,base_latitude,base_longitude,default_service_radius_km').in('id',orgIds),
        supabase.from('provider_travel_bands').select('organisation_id,service_key,minimum_distance_meters,maximum_distance_meters,charge_pence,reject_beyond_band').in('organisation_id',orgIds).eq('active',true)
      ]);
      const cardIds=(cards||[]).map(card=>card.id);
      const [{data:rateItems},{data:engineers},{data:busyJobs}]=await Promise.all([
        cardIds.length&&job.service_key?supabase.from('provider_rate_items').select('rate_card_id,service_key,pricing_mode,fixed_price_pence,callout_pence,hourly_pence,minimum_charge_pence,estimated_duration_minutes,emergency_multiplier,travel_rules').in('rate_card_id',cardIds).eq('service_key',job.service_key).eq('active',true):Promise.resolve({data:[]}),
        supabase.from('engineers').select('id,organisation_id,available_now,can_work_unsupervised,status').in('organisation_id',orgIds).eq('status','active').eq('can_work_unsupervised',true),
        supabase.from('jobs').select('assigned_engineer_id,requested_start,requested_end,estimated_duration_minutes,status').in('status',['accepted','scheduled','in_progress']).not('assigned_engineer_id','is',null)
      ]);
      const engineerIds=(engineers||[]).map(e=>e.id);
      const [{data:availability},{data:liveLocations}]=engineerIds.length?await Promise.all([
        supabase.from('engineer_availability_rules').select('engineer_id,day_of_week,start_time,end_time,auto_accept,minimum_job_pence,maximum_duration_minutes,maximum_travel_minutes,buffer_before_minutes,buffer_after_minutes,maximum_jobs_per_day,allowed_service_keys').in('engineer_id',engineerIds).eq('active',true),
        supabase.from('engineer_live_locations').select('engineer_id,latitude,longitude,expires_at').in('engineer_id',engineerIds).gt('expires_at',new Date().toISOString())
      ]):[{data:[] as Availability[]},{data:[] as Array<{engineer_id:string;latitude:number;longitude:number;expires_at:string}>}];
      const serviceProviderIds=new Set((serviceRows||[]).map(row=>row.provider_id));
      const priorityByProvider=new Map((coverage||[]).map(row=>[row.provider_id,row.priority]));
      const tried=new Set((triedOffers||[]).map(row=>row.provider_id));
      const prepared:Array<{providerId:string;engineerId:string;autoAccept:boolean;quote:{providerPricePence:number;platformFeePence:number;customerTotalPence:number;providerReceivesPence:number;customerFeeBps:number;currency:'GBP'};durationMinutes:number;distanceMeters:number|null;durationSeconds:number|null;routeSource:string|null;scoreInput:Parameters<typeof rankProviders>[0][number]}>=[];
      for(const provider of eligibleProviders){
        if(tried.has(provider.id)||!serviceProviderIds.has(provider.id))continue;
        const providerCard=(cards||[]).find(card=>card.organisation_id===provider.organisation_id);
        if(!providerCard)continue;
        const rate=(rateItems||[]).find(item=>item.rate_card_id===providerCard.id);
        if(!rate)continue;
        const duration=Number(job.estimated_duration_minutes||rate.estimated_duration_minutes||60);
        const selected=chooseEngineer({engineers:(engineers||[]).filter(e=>e.organisation_id===provider.organisation_id) as Engineer[],rules:(availability||[]) as Availability[],busy:(busyJobs||[]) as BusyJob[],scheduleMode:job.schedule_mode,requestedStart:job.requested_start,requestedEnd:job.requested_end,durationMinutes:duration,providerPricePence:Number(rate.fixed_price_pence||rate.minimum_charge_pence||0),serviceKey:job.service_key});
        if(!selected)continue;
        const org=(organisations||[]).find(o=>o.id===provider.organisation_id);
        const live=(liveLocations||[]).find(l=>l.engineer_id===selected.engineer.id);
        const origin=live?{latitude:Number(live.latitude),longitude:Number(live.longitude)}:org?.base_latitude!=null&&org?.base_longitude!=null?{latitude:Number(org.base_latitude),longitude:Number(org.base_longitude)}:null;
        const destination=job.latitude!=null&&job.longitude!=null?{latitude:Number(job.latitude),longitude:Number(job.longitude)}:null;
        let routed:null|{distanceMeters:number;durationSeconds:number;source:string}=null;
        let coarseDistance:number|null=null;
        if(origin&&destination){
          coarseDistance=haversineMeters(origin,destination);
          if(org?.default_service_radius_km&&coarseDistance>Number(org.default_service_radius_km)*1000)continue;
          routed=await routeEta(origin,destination);
        }
        const distanceForRules=routed?.distanceMeters??coarseDistance;
        const bands=(travelBands||[]).filter(b=>b.organisation_id===provider.organisation_id) as TravelBand[];
        const travelBand=distanceForRules!=null?selectTravelCharge(bands,job.service_key||undefined,distanceForRules):{chargePence:legacyTravelCharge(rate.travel_rules),rejected:false};
        if(travelBand.rejected)continue;
        if(selected.rule?.maximum_travel_minutes&&routed&&routed.durationSeconds>selected.rule.maximum_travel_minutes*60)continue;
        let providerPrice:number;
        try{
          providerPrice=calculateProviderPrice({pricingMode:rate.pricing_mode,fixedPricePence:rate.fixed_price_pence,calloutPence:Number(rate.callout_pence||0),hourlyPence:rate.hourly_pence,minimumChargePence:Number(rate.minimum_charge_pence||0),estimatedDurationMinutes:duration,emergencyMultiplier:Number(rate.emergency_multiplier||1),travelChargePence:travelBand.chargePence},duration,job.urgency==='emergency');
        }catch{continue}
        const quote=calculateTransparentQuote({providerPricePence:providerPrice,customerFeeBps:Number(policy?.customer_fee_bps??1500),minimumFeePence:policy?.minimum_fee_pence??null,maximumFeePence:policy?.maximum_fee_pence??null});
        const autoAccept=selected.autoRule&&(!selected.rule?.maximum_travel_minutes||Boolean(routed));
        if(routed){
          await supabase.from('routing_snapshots').insert({job_id:job.id,provider_id:provider.id,engineer_id:selected.engineer.id,origin_kind:live?'live':'business_base',distance_meters:routed.distanceMeters,duration_seconds:routed.durationSeconds,source:routed.source,expires_at:new Date(Date.now()+5*60_000).toISOString()});
        }
        prepared.push({providerId:provider.id,engineerId:selected.engineer.id,autoAccept,quote,durationMinutes:duration,distanceMeters:routed?.distanceMeters??coarseDistance,durationSeconds:routed?.durationSeconds??null,routeSource:routed?.source??null,scoreInput:{providerId:provider.id,coversArea:true,serviceMatch:true,verificationActive:provider.verification_state==='active',availableNow:Boolean(selected.engineer.available_now||provider.available_now),qualityScore:Number(provider.quality_score),acceptanceRate:Number(provider.acceptance_rate),completionRate:Number(provider.completion_rate),reworkRate:Number(provider.rework_rate),coveragePriority:Number(priorityByProvider.get(provider.id)??50)}});
      }
      const ranked=rankProviders(prepared.map(p=>p.scoreInput));
      if(!ranked.length){results.push({jobId:job.id,status:'no_priced_engineer_available'});continue}
      const maxOffers=fanoutCount(job.urgency);let accepted=false;const offers:DispatchOffer[]=[];
      for(const rankedProvider of ranked.slice(0,maxOffers)){
        const preparedProvider=prepared.find(p=>p.providerId===rankedProvider.providerId)!;
        const offerRank:number=(triedOffers?.length||0)+offers.length+1;
        const expiresAt=new Date(Date.now()+expirySeconds(job.urgency)*1000).toISOString();
        const {data:offer,error:offerError}:{data:{id:string}|null;error:{message?:string}|null}=await supabase.from('job_offers').insert({job_id:job.id,provider_id:preparedProvider.providerId,engineer_id:preparedProvider.engineerId,status:'offered',rank:offerRank,offer_wave:offerRank,expires_at:expiresAt,provider_price_pence:preparedProvider.quote.providerPricePence,platform_fee_pence:preparedProvider.quote.platformFeePence,customer_total_pence:preparedProvider.quote.customerTotalPence,currency:'GBP'}).select('id').single();
        if(offerError||!offer){offers.push({providerId:preparedProvider.providerId,status:'offer_failed'});continue}
        const estimatedArrival=preparedProvider.durationSeconds?new Date(Date.now()+preparedProvider.durationSeconds*1000).toISOString():null;
        await supabase.from('jobs').update({status:'offered',quoted_provider_id:preparedProvider.providerId,quoted_engineer_id:preparedProvider.engineerId,provider_price_pence:preparedProvider.quote.providerPricePence,platform_fee_pence:preparedProvider.quote.platformFeePence,customer_total_pence:preparedProvider.quote.customerTotalPence,currency:'GBP',estimated_duration_minutes:preparedProvider.durationMinutes,route_distance_meters:preparedProvider.distanceMeters,route_duration_seconds:preparedProvider.durationSeconds,route_source:preparedProvider.routeSource,route_calculated_at:preparedProvider.routeSource?new Date().toISOString():null,estimated_arrival_at:job.schedule_mode==='asap'?estimatedArrival:job.requested_start,dispatch_started_at:new Date().toISOString(),last_offer_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id).in('status',['new','offered']);
        offers.push({offerId:offer.id,providerId:preparedProvider.providerId,engineerId:preparedProvider.engineerId,score:rankedProvider.score,expiresAt,quote:preparedProvider.quote,autoAccept:preparedProvider.autoAccept,distanceMeters:preparedProvider.distanceMeters??undefined,durationSeconds:preparedProvider.durationSeconds??undefined});
        if(preparedProvider.autoAccept){
          const {error:autoError}=await supabase.rpc('respond_to_job_offer',{p_offer_id:offer.id,p_provider_id:preparedProvider.providerId,p_action:'accept'});
          if(!autoError){accepted=true;offers[offers.length-1]={...offers[offers.length-1],status:'auto_accepted'};break}
        }
      }
      results.push({jobId:job.id,status:accepted?'accepted':'offered',offers});
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Dispatch worker failed.'},{status:500});
  }
}
