import { NextResponse } from 'next/server';
import { calculateAreaReadiness } from '@service-business/platform';
import { electricalVertical } from '@service-business/electrical';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

function authorised(request:Request){const secret=process.env.CRON_SECRET;return Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`}
function median(values:number[]){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);const i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2}

export async function POST(request:Request){
  if(!authorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();const since=new Date(Date.now()-30*86400000).toISOString();
    const [{data:existing},{data:coverage},{data:jobs},{data:acceptedOffers}]=await Promise.all([
      supabase.from('service_areas').select('area').eq('vertical_id',electricalVertical.id),
      supabase.from('provider_coverage').select('area,provider_id,providers!inner(verification_state)').eq('active',true).eq('providers.verification_state','active'),
      supabase.from('jobs').select('id,postcode,status,matched_provider_id,created_at').eq('vertical_id',electricalVertical.id).gte('created_at',since),
      supabase.from('job_offers').select('job_id,responded_at,jobs!inner(postcode,created_at)').eq('status','accepted').not('responded_at','is',null).gte('responded_at',since)
    ]);
    const areas=new Set<string>();for(const row of existing||[])areas.add(String(row.area).toUpperCase());for(const row of coverage||[])areas.add(String(row.area).toUpperCase());
    const results=[];
    for(const area of areas){
      const providerIds=new Set((coverage||[]).filter(row=>String(row.area).toUpperCase()===area).map(row=>row.provider_id));
      const areaJobs=(jobs||[]).filter(job=>String(job.postcode||'').toUpperCase().startsWith(area));
      const demand=areaJobs.length;const filled=areaJobs.filter(job=>Boolean(job.matched_provider_id)||['accepted','scheduled','in_progress','completed'].includes(job.status)).length;
      const fillRate=demand?filled/demand:1;
      const matchMinutes=(acceptedOffers||[]).flatMap((offer:any)=>{const joined=Array.isArray(offer.jobs)?offer.jobs[0]:offer.jobs;if(!joined||!String(joined.postcode||'').toUpperCase().startsWith(area)||!offer.responded_at)return[];return[(Date.parse(offer.responded_at)-Date.parse(joined.created_at))/60000]}).filter((n:number)=>Number.isFinite(n)&&n>=0);
      const medianMatch=median(matchMinutes);
      const readiness=calculateAreaReadiness(area,providerIds.size,fillRate,medianMatch,electricalVertical.launchThresholds);
      const {error}=await supabase.from('service_areas').upsert({vertical_id:electricalVertical.id,area,status:readiness.status,verified_providers:providerIds.size,fill_rate:fillRate,median_match_minutes:medianMatch,demand_30d:demand,updated_at:new Date().toISOString()},{onConflict:'vertical_id,area'});
      if(!error)results.push(readiness);
    }
    return NextResponse.json({ok:true,areas:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Coverage refresh failed.'},{status:500});
  }
}
