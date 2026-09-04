import { NextResponse } from 'next/server';
import { calculateProviderPrice,calculateTransparentQuote,rankProviders } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const BATCH_SIZE=25;
const DAY_INDEX:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};

type Engineer={id:string;organisation_id:string;available_now:boolean;can_work_unsupervised:boolean;status:string};
type Availability={engineer_id:string;day_of_week:number;start_time:string;end_time:string;auto_accept:boolean;minimum_job_pence:number;maximum_duration_minutes:number|null;maximum_travel_minutes:number|null};
type BusyJob={assigned_engineer_id:string;requested_start:string|null;requested_end:string|null;estimated_duration_minutes:number|null;status:string};

function londonDayAndTime(date:Date){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const value=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return{day:DAY_INDEX[value('weekday')],time:`${value('hour')}:${value('minute')}`};
}
function overlaps(start:Date,end:Date,busy:BusyJob){
  if(!busy.requested_start)return false;
  const busyStart=new Date(busy.requested_start);
  const busyEnd=busy.requested_end?new Date(busy.requested_end):new Date(busyStart.getTime()+(busy.estimated_duration_minutes||60)*60_000);
  return start<busyEnd&&busyStart<end;
}
function travelCharge(travelRules:unknown){
  if(!Array.isArray(travelRules))return 0;
  const flat=travelRules.find((rule):rule is {type:string;amountPence:number}=>Boolean(rule&&typeof rule==='object'&&(rule as {type?:unknown}).type==='flat'));
  return flat&&Number.isFinite(Number(flat.amountPence))?Number(flat.amountPence):0;
}
function expirySeconds(urgency:string){return urgency==='emergency'?20:urgency==='urgent'?30:45}
function fanoutCount(urgency:string){return urgency==='emergency'?3:urgency==='urgent'?2:1}

function chooseEngineer(input:{engineers:Engineer[];rules:Availability[];busy:BusyJob[];scheduleMode:string;requestedStart:string|null;requestedEnd:string|null;durationMinutes:number;providerPricePence:number}){
  const now=new Date();
  const serviceStart=input.requestedStart?new Date(input.requestedStart):now;
  const serviceEnd=input.requestedEnd?new Date(input.requestedEnd):new Date(serviceStart.getTime()+input.durationMinutes*60_000);
  const local=londonDayAndTime(serviceStart);
  const candidates=input.engineers.filter(engineer=>{
    if(engineer.status!=='active'||!engineer.can_work_unsupervised)return false;
    if(input.scheduleMode==='asap'&&engineer.available_now)return true;
    const engineerRules=input.rules.filter(rule=>rule.engineer_id===engineer.id&&rule.day_of_week===local.day&&rule.start_time.slice(0,5)<=local.time&&rule.end_time.slice(0,5)>=local.time);
    if(!engineerRules.length)return false;
    return !input.busy.filter(job=>job.assigned_engineer_id===engineer.id).some(job=>overlaps(serviceStart,serviceEnd,job));
  });
  if(!candidates.length)return null;
  candidates.sort((a,b)=>Number(b.available_now)-Number(a.available_now)||a.id.localeCompare(b.id));
  const engineer=candidates[0];
  const matchingRules=input.rules.filter(rule=>rule.engineer_id===engineer.id&&rule.day_of_week===local.day&&rule.start_time.slice(0,5)<=local.time&&rule.end_time.slice(0,5)>=local.time);
  const autoRule=matchingRules.find(rule=>rule.auto_accept&&input.providerPricePence>=Number(rule.minimum_job_pence||0)&&(!rule.maximum_duration_minutes||input.durationMinutes<=rule.maximum_duration_minutes)&&!rule.maximum_travel_minutes);
  return{engineer,autoAccept:Boolean(autoRule)};
}

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    await supabase.rpc('expire_stale_job_offers');
    const {data:policy}=await supabase.from('platform_pricing_policies').select('customer_fee_bps,minimum_fee_pence,maximum_fee_pence').eq('vertical_id','electrical').eq('active',true).maybeSingle();
    const {data:jobs,error:jobsError}=await supabase.from('jobs').select('id,postcode,service_key,status,urgency,schedule_mode,requested_start,requested_end,estimated_duration_minutes').eq('status','new').order('created_at',{ascending:true}).limit(BATCH_SIZE);
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
      const {data:cards}=await supabase.from('provider_rate_cards').select('id,organisation_id,version').in('organisation_id',orgIds).eq('active',true).order('version',{ascending:false});
      const cardIds=(cards||[]).map(card=>card.id);
      const [{data:rateItems},{data:engineers},{data:busyJobs}]=await Promise.all([
        cardIds.length&&job.service_key?supabase.from('provider_rate_items').select('rate_card_id,service_key,pricing_mode,fixed_price_pence,callout_pence,hourly_pence,minimum_charge_pence,estimated_duration_minutes,emergency_multiplier,travel_rules').in('rate_card_id',cardIds).eq('service_key',job.service_key).eq('active',true):Promise.resolve({data:[]}),
        supabase.from('engineers').select('id,organisation_id,available_now,can_work_unsupervised,status').in('organisation_id',orgIds).eq('status','active').eq('can_work_unsupervised',true),
        supabase.from('jobs').select('assigned_engineer_id,requested_start,requested_end,estimated_duration_minutes,status').in('status',['accepted','scheduled','in_progress']).not('assigned_engineer_id','is',null)
      ]);
      const engineerIds=(engineers||[]).map(e=>e.id);
      const {data:availability}=engineerIds.length?await supabase.from('engineer_availability_rules').select('engineer_id,day_of_week,start_time,end_time,auto_accept,minimum_job_pence,maximum_duration_minutes,maximum_travel_minutes').in('engineer_id',engineerIds).eq('active',true):{data:[] as Availability[]};
      const serviceProviderIds=new Set((serviceRows||[]).map(row=>row.provider_id));
      const priorityByProvider=new Map((coverage||[]).map(row=>[row.provider_id,row.priority]));
      const tried=new Set((triedOffers||[]).map(row=>row.provider_id));
      const prepared:Array<{providerId:string;engineerId:string;autoAccept:boolean;quote:{providerPricePence:number;platformFeePence:number;customerTotalPence:number;providerReceivesPence:number;customerFeeBps:number;currency:'GBP'};durationMinutes:number;scoreInput:Parameters<typeof rankProviders>[0][number]}>=[];
      for(const provider of eligibleProviders){
        if(tried.has(provider.id)||!serviceProviderIds.has(provider.id))continue;
        const providerCard=(cards||[]).find(card=>card.organisation_id===provider.organisation_id);
        if(!providerCard)continue;
        const rate=(rateItems||[]).find(item=>item.rate_card_id===providerCard.id);
        if(!rate)continue;
        const duration=Number(job.estimated_duration_minutes||rate.estimated_duration_minutes||60);
        let providerPrice:number;
        try{
          providerPrice=calculateProviderPrice({pricingMode:rate.pricing_mode,fixedPricePence:rate.fixed_price_pence,calloutPence:Number(rate.callout_pence||0),hourlyPence:rate.hourly_pence,minimumChargePence:Number(rate.minimum_charge_pence||0),estimatedDurationMinutes:duration,emergencyMultiplier:Number(rate.emergency_multiplier||1),travelChargePence:travelCharge(rate.travel_rules)},duration,job.urgency==='emergency');
        }catch{continue}
        const quote=calculateTransparentQuote({providerPricePence:providerPrice,customerFeeBps:Number(policy?.customer_fee_bps??1500),minimumFeePence:policy?.minimum_fee_pence??null,maximumFeePence:policy?.maximum_fee_pence??null});
        const selected=chooseEngineer({engineers:(engineers||[]).filter(e=>e.organisation_id===provider.organisation_id) as Engineer[],rules:(availability||[]) as Availability[],busy:(busyJobs||[]) as BusyJob[],scheduleMode:job.schedule_mode,requestedStart:job.requested_start,requestedEnd:job.requested_end,durationMinutes:duration,providerPricePence:providerPrice});
        if(!selected)continue;
        prepared.push({providerId:provider.id,engineerId:selected.engineer.id,autoAccept:selected.autoAccept,quote,durationMinutes:duration,scoreInput:{providerId:provider.id,coversArea:true,serviceMatch:true,verificationActive:provider.verification_state==='active',availableNow:Boolean(selected.engineer.available_now||provider.available_now),qualityScore:Number(provider.quality_score),acceptanceRate:Number(provider.acceptance_rate),completionRate:Number(provider.completion_rate),reworkRate:Number(provider.rework_rate),coveragePriority:Number(priorityByProvider.get(provider.id)??50)}});
      }
      const ranked=rankProviders(prepared.map(p=>p.scoreInput));
      if(!ranked.length){results.push({jobId:job.id,status:'no_priced_engineer_available'});continue}
      const maxOffers=fanoutCount(job.urgency);let accepted=false;const offers=[];
      for(const rankedProvider of ranked.slice(0,maxOffers)){
        const preparedProvider=prepared.find(p=>p.providerId===rankedProvider.providerId)!;
        const rank=(triedOffers?.length||0)+offers.length+1;
        const expiresAt=new Date(Date.now()+expirySeconds(job.urgency)*1000).toISOString();
        const {data:offer,error:offerError}=await supabase.from('job_offers').insert({job_id:job.id,provider_id:preparedProvider.providerId,engineer_id:preparedProvider.engineerId,status:'offered',rank,offer_wave:rank,expires_at:expiresAt,provider_price_pence:preparedProvider.quote.providerPricePence,platform_fee_pence:preparedProvider.quote.platformFeePence,customer_total_pence:preparedProvider.quote.customerTotalPence,currency:'GBP'}).select('id').single();
        if(offerError){offers.push({providerId:preparedProvider.providerId,status:'offer_failed'});continue}
        await supabase.from('jobs').update({status:'offered',quoted_provider_id:preparedProvider.providerId,quoted_engineer_id:preparedProvider.engineerId,provider_price_pence:preparedProvider.quote.providerPricePence,platform_fee_pence:preparedProvider.quote.platformFeePence,customer_total_pence:preparedProvider.quote.customerTotalPence,currency:'GBP',estimated_duration_minutes:preparedProvider.durationMinutes,dispatch_started_at:new Date().toISOString(),last_offer_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id).in('status',['new','offered']);
        offers.push({offerId:offer.id,providerId:preparedProvider.providerId,engineerId:preparedProvider.engineerId,score:rankedProvider.score,expiresAt,quote:preparedProvider.quote,autoAccept:preparedProvider.autoAccept});
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
