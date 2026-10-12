import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {runInternalWorkers,type InternalWorker} from '@/lib/worker-runner';
import {POST as operationalKpis} from '@/app/api/internal/operational-kpis/route';
import {POST as qualityRanking} from '@/app/api/internal/quality-ranking/route';
import {POST as labourDemand} from '@/app/api/internal/labour-demand/route';
import {POST as coverageRecruitment} from '@/app/api/internal/coverage-recruitment/route';
import {POST as financeClose} from '@/app/api/internal/finance-close/route';
import {POST as reserves} from '@/app/api/internal/reserves/route';
import {POST as competencyLifecycle} from '@/app/api/internal/competency-lifecycle/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const workers:InternalWorker[]=[
  {path:'/api/internal/operational-kpis',run:operationalKpis},
  {path:'/api/internal/quality-ranking',run:qualityRanking},
  {path:'/api/internal/labour-demand',run:labourDemand},
  {path:'/api/internal/coverage-recruitment',run:coverageRecruitment},
  {path:'/api/internal/finance-close',run:financeClose},
  {path:'/api/internal/reserves',run:reserves},
  {path:'/api/internal/competency-lifecycle',run:competencyLifecycle}
];

export async function GET(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:'Cron infrastructure is not configured.'},{status:503});
  const results=await runInternalWorkers(request,workers,secret);
  const failed=results.filter(result=>!result.ok);
  return NextResponse.json({ok:failed.length===0,ran:results.length,failed:failed.length,results,checkedAt:new Date().toISOString()},{status:failed.length?503:200,headers:{'cache-control':'no-store'}});
}
