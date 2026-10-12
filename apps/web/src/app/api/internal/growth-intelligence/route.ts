import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {suggestGrowthAction} from '@/lib/growth-intelligence';
export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  if(process.env.ENABLE_GROWTH_INTELLIGENCE!=='true')return NextResponse.json({enabled:false});
  try{
    const db=getAdminSupabase();
    const {data,error}=await db.from('coverage_gap_signals')
      .select('area,service_key,demand_count,verified_provider_count,gap_score')
      .gt('demand_count',0).limit(100);
    if(error)return NextResponse.json({error:'Signals unavailable'},{status:503});
    let suggestions=0;
    for(const item of data||[]){
      const s=suggestGrowthAction({...item,gap_score:Number(item.gap_score)});
      if(!s)continue;
      const {error:saveError}=await db.from('growth_action_recommendations').upsert({
        source_reference:s.reference,category:s.category,priority:s.priority,explanation:s.reason,
        evidence:{area:item.area,service:item.service_key,demand:item.demand_count,
          providers:item.verified_provider_count}
      },{onConflict:'source_reference',ignoreDuplicates:true});
      if(saveError)return NextResponse.json({error:'Recommendation failed'},{status:503});
      suggestions++;
      if(s.category==='content'){
        const today=new Date();
        const month=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)).toISOString().slice(0,10);
        const {error:draftError}=await db.from('growth_content_drafts').upsert({
          vertical_id:'electrical',area:item.area,service_key:item.service_key,period_start:month,
          headline:`${item.service_key} in ${item.area}: what customers should know`,
          brief:`Editorial review required. Measured demand ${item.demand_count}, verified providers ${item.verified_provider_count}. Recheck coverage before publication.`,
          demand_count:item.demand_count,verified_provider_count:item.verified_provider_count,
          status:'review'
        },{onConflict:'vertical_id,area,service_key,period_start',ignoreDuplicates:true});
        if(draftError)return NextResponse.json({error:'Draft storage failed'},{status:503});
      }
    }
    return NextResponse.json({enabled:true,signals:data?.length||0,suggestions});
  }catch{return NextResponse.json({error:'Growth worker failed'},{status:503});}
}
