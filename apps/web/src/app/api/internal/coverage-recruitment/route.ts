import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const WINDOW_DAYS=30;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const since=new Date(Date.now()-WINDOW_DAYS*86_400_000).toISOString();
    const [{data:areas,error:areaError},{data:jobs,error:jobError},{data:coverage,error:coverageError}]=await Promise.all([
      supabase.from('service_areas').select('area,status'),
      supabase.from('jobs').select('id,postcode,service_key,status,created_at').gte('created_at',since),
      supabase.from('provider_coverage').select('area,provider_id,active,providers!inner(verification_state)').eq('active',true).eq('providers.verification_state','active')
    ]);
    if(areaError||jobError||coverageError)return NextResponse.json({error:'Unable to calculate coverage gaps.'},{status:500});
    const keys=new Set<string>();
    for(const job of jobs||[]){const area=(job.postcode||'').trim().toUpperCase().split(' ')[0];if(area&&job.service_key)keys.add(`${area}|${job.service_key}`)}
    const results:Array<Record<string,unknown>>=[];
    for(const key of keys){
      const [area,serviceKey]=key.split('|');
      const demand=(jobs||[]).filter(j=>(j.postcode||'').trim().toUpperCase().startsWith(area)&&j.service_key===serviceKey);
      const completed=demand.filter(j=>j.status==='completed').length;
      const providerCount=new Set((coverage||[]).filter(c=>c.area===area).map(c=>c.provider_id)).size;
      const fillRate=demand.length?completed/demand.length:1;
      const demandPressure=Math.min(1,demand.length/20);
      const supplyPressure=1-Math.min(1,providerCount/3);
      const fillPressure=1-Math.min(1,fillRate);
      const gapScore=Math.round((demandPressure*.40+supplyPressure*.40+fillPressure*.20)*1000)/10;
      const status=gapScore>=45?'recruiting':'healthy';
      await supabase.from('coverage_gap_signals').upsert({area,service_key:serviceKey,window_days:WINDOW_DAYS,demand_count:demand.length,verified_provider_count:providerCount,fill_rate:fillRate,gap_score:gapScore,status,calculated_at:new Date().toISOString()},{onConflict:'area,service_key,window_days'});
      if(status==='recruiting'){
        const sourceReference=`coverage-gap:${area}:${serviceKey}`;
        const {data:existing}=await supabase.from('growth_outreach_queue').select('id').eq('workstream','provider_recruitment').eq('source_reference',sourceReference).in('status',['discovered','verified','ready','contacted']).limit(1).maybeSingle();
        if(!existing)await supabase.from('growth_outreach_queue').insert({workstream:'provider_recruitment',area,service_key:serviceKey,source_reference:sourceReference,score:gapScore,status:'discovered',notes:`Autonomous supply-gap lead. ${demand.length} jobs / ${providerCount} verified providers in ${WINDOW_DAYS} days.`});
      }
      results.push({area,serviceKey,demand:demand.length,providers:providerCount,fillRate,gapScore,status});
    }
    return NextResponse.json({areas:areas?.length||0,signals:results.length,recruiting:results.filter(r=>r.status==='recruiting').length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Coverage recruitment worker failed.'},{status:500});
  }
}
