import {NextResponse} from 'next/server';
import {isAutonomyAdmin} from '@/lib/autonomy-admin';
import {getAdminSupabase} from '@/lib/supabase/admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await isAutonomyAdmin())return NextResponse.json({error:'Forbidden'},{status:403});
 try{
  const db=getAdminSupabase();
  const [controls,jobs,incidents,events,recommendations]=await Promise.all([
   db.from('autonomy_controls').select('domain,enabled,updated_at').order('domain'),
   db.from('autonomy_workflows').select('id,kind,domain,status,attempts,available_at,updated_at')
      .order('updated_at',{ascending:false}).limit(100),
   db.from('autonomy_incidents').select('id,severity,category,summary,status,last_seen_at')
      .order('last_seen_at',{ascending:false}).limit(40),
   db.from('autonomy_execution_events').select('workflow_id,attempt,event_type,created_at')
      .order('created_at',{ascending:false}).limit(50),
   db.from('autonomy_recommendations').select('id,category,explanation,status,confidence,created_at')
      .order('created_at',{ascending:false}).limit(25)
  ]);
  if([controls,jobs,incidents,events,recommendations].some(r=>r.error))
    return NextResponse.json({error:'Mission Control data unavailable'},{status:503});
  return NextResponse.json({controls:controls.data,
   workflows:jobs.data,incidents:incidents.data,events:events.data,
   recommendations:recommendations.data,
   kernelConfigured:process.env.AUTONOMY_KERNEL_ENABLED==='true',
   alertsConfigured:Boolean(process.env.AUTONOMY_ALERT_EMAIL),
   generatedAt:new Date().toISOString()
  },{headers:{'cache-control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Mission Control unavailable'},{status:503});}
}
