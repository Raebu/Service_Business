import { NextResponse } from 'next/server';
import { rankProviders } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const OFFER_MINUTES=10;
const BATCH_SIZE=25;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    await supabase.rpc('expire_stale_job_offers');
    const {data:jobs,error:jobsError}=await supabase.from('jobs').select('id,postcode,service_key,status').eq('status','new').order('created_at',{ascending:true}).limit(BATCH_SIZE);
    if(jobsError)return NextResponse.json({error:'Unable to load pending jobs.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const job of jobs||[]){
      const outward=(job.postcode||'').trim().toUpperCase().split(' ')[0]||'';
      const areaMatch=outward.match(/^[A-Z]{1,2}/)?.[0]||outward;
      const {data:coverage}=await supabase.from('provider_coverage').select('provider_id,priority').eq('area',areaMatch).eq('active',true);
      const providerIds=(coverage||[]).map(row=>row.provider_id);
      if(!providerIds.length){results.push({jobId:job.id,status:'no_eligible_provider'});continue}
      const [{data:providers},{data:triedOffers},{data:serviceRows}]=await Promise.all([
        supabase.from('providers').select('id,verification_state,available_now,quality_score,acceptance_rate,completion_rate,rework_rate').in('id',providerIds).eq('verification_state','active'),
        supabase.from('job_offers').select('provider_id').eq('job_id',job.id),
        job.service_key?supabase.from('provider_services').select('provider_id').in('provider_id',providerIds).eq('service_key',job.service_key).eq('active',true):Promise.resolve({data:providerIds.map(provider_id=>({provider_id}))})
      ]);
      const serviceProviderIds=new Set((serviceRows||[]).map(row=>row.provider_id));
      const priorityByProvider=new Map((coverage||[]).map(row=>[row.provider_id,row.priority]));
      const ranked=rankProviders((providers||[]).map(provider=>({
        providerId:provider.id,
        coversArea:true,
        serviceMatch:serviceProviderIds.has(provider.id),
        verificationActive:provider.verification_state==='active',
        availableNow:Boolean(provider.available_now),
        qualityScore:Number(provider.quality_score),
        acceptanceRate:Number(provider.acceptance_rate),
        completionRate:Number(provider.completion_rate),
        reworkRate:Number(provider.rework_rate),
        coveragePriority:Number(priorityByProvider.get(provider.id)??50)
      })),(triedOffers||[]).map(row=>row.provider_id));
      const next=ranked[0];
      if(!next){results.push({jobId:job.id,status:'provider_pool_exhausted'});continue}
      const rank=(triedOffers?.length||0)+1;
      const expiresAt=new Date(Date.now()+OFFER_MINUTES*60_000).toISOString();
      const {error:offerError}=await supabase.from('job_offers').insert({job_id:job.id,provider_id:next.providerId,status:'offered',rank,expires_at:expiresAt});
      if(offerError){results.push({jobId:job.id,status:'offer_failed'});continue}
      await supabase.from('jobs').update({status:'offered',updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','new');
      results.push({jobId:job.id,status:'offered',providerId:next.providerId,score:next.score,expiresAt});
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Dispatch worker failed.'},{status:500});
  }
}
