import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {POST as run} from '@/app/api/internal/autonomy/run/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  if(!process.env.CRON_SECRET)return NextResponse.json({error:'Cron unavailable'},{status:503});
  return run(new Request(new URL('/api/internal/autonomy/run',request.url),{
    method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}
  }));
}
