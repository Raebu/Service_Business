import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {runInternalWorkers,type InternalWorker} from '@/lib/worker-runner';
import {POST as dispatch} from '@/app/api/internal/dispatch/route';
import {POST as notifications} from '@/app/api/internal/notifications/route';
import {POST as compliance} from '@/app/api/internal/compliance/route';
import {POST as recovery} from '@/app/api/internal/recovery-monitor/route';
import {POST as sla} from '@/app/api/internal/sla-monitor/route';
import {POST as reconciliation} from '@/app/api/internal/reconciliation/route';
import {POST as settlements} from '@/app/api/internal/settlements/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// A high-frequency scheduler must be configured separately. Remain disabled
// until sandbox journeys and operational notification tests have passed.
const operationalWorkers:InternalWorker[]=[
  {path:'/api/internal/dispatch',run:dispatch},
  {path:'/api/internal/notifications',run:notifications},
  {path:'/api/internal/compliance',run:compliance},
  {path:'/api/internal/recovery-monitor',run:recovery},
  {path:'/api/internal/sla-monitor',run:sla},
  {path:'/api/internal/reconciliation',run:reconciliation}
];

export async function GET(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  if(process.env.ENABLE_OPERATIONAL_CYCLE!=='true')return NextResponse.json({error:'Operational workers are disabled pending launch validation.'},{status:503});
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:'Cron infrastructure is not configured.'},{status:503});
  const workers=process.env.ENABLE_AUTOMATED_SETTLEMENTS==='true'
    ?[...operationalWorkers,{path:'/api/internal/settlements',run:settlements}]
    :operationalWorkers;
  const results=await runInternalWorkers(request,workers,secret);
  const failed=results.filter(result=>!result.ok);
  return NextResponse.json({ok:failed.length===0,ran:results.length,failed:failed.length,results,checkedAt:new Date().toISOString()},{status:failed.length?207:200,headers:{'cache-control':'no-store'}});
}
