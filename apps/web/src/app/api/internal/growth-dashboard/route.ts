import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Internal-only operational control centre. No personally identifiable lead data in response. */
export async function GET(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  try{
    const db=getAdminSupabase();
    const [controls,campaigns,leads,attempts,inbox,suppressed,runs]=await Promise.all([
      db.from('growth_controls').select('outbound_enabled,inbound_enabled,follow_ups_enabled,max_per_hour,max_per_day').eq('id',true).single(),
      db.from('growth_campaigns').select('id,status,workstream,created_at'),
      db.from('growth_outreach_queue').select('id,status,workstream'),
      db.from('growth_outreach_attempts').select('id,status,claimed_at').gte('claimed_at',new Date(Date.now()-30*86400000).toISOString()),
      db.from('growth_inbound_messages').select('id,classification,processed').eq('processed',false),
      db.from('growth_suppressions').select('email',{count:'exact',head:true}),
      db.from('growth_automation_runs').select('worker,status,ran_at').order('ran_at',{ascending:false}).limit(15)
    ]);
    if([controls,campaigns,leads,attempts,inbox,suppressed,runs].some(x=>x.error))
      return NextResponse.json({error:'Unable to read growth dashboard'},{status:503});
    const count=(rows:Array<{status:string}>|null|undefined)=>rows?.reduce<Record<string,number>>((acc,r)=>{
      acc[r.status]=(acc[r.status]||0)+1;return acc;
    },{})||{};
    return NextResponse.json({controls:controls.data,
      campaigns:count(campaigns.data),
      pipeline:count(leads.data),
      delivery:count(attempts.data),
      inboundNeedingReview:inbox.data?.length||0,
      suppressed:suppressed.count||0,
      recentWorkers:runs.data,
      operationalMode:process.env.ENABLE_AUTONOMOUS_OUTREACH==='true'?'configured_for_live_gated':'disabled',
      generatedAt:new Date().toISOString()
    },{headers:{'cache-control':'no-store'}});
  }catch{return NextResponse.json({error:'Growth dashboard failed'},{status:503});}
}
