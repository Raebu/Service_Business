import { NextResponse } from 'next/server';
import { internalRequestAuthorised } from '@/lib/internal';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const workers=[
  '/api/internal/operational-kpis',
  '/api/internal/quality-ranking',
  '/api/internal/labour-demand',
  '/api/internal/coverage-recruitment'
] as const;

export async function GET(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:'Cron infrastructure is not configured.'},{status:503});
  const origin=new URL(request.url).origin;
  const results:Array<{path:string;ok:boolean;status:number;detail?:string}>=[];
  for(const path of workers){
    try{
      const response=await fetch(`${origin}${path}`,{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(20_000)});
      const body=await response.text();
      results.push({path,ok:response.ok,status:response.status,detail:response.ok?undefined:body.slice(0,300)});
    }catch(error){
      results.push({path,ok:false,status:0,detail:error instanceof Error?error.message:'Worker request failed'});
    }
  }
  const failed=results.filter(result=>!result.ok);
  return NextResponse.json({ok:failed.length===0,ran:results.length,failed:failed.length,results,checkedAt:new Date().toISOString()},{status:failed.length?207:200,headers:{'cache-control':'no-store'}});
}
