import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {POST as outreach} from '@/app/api/internal/growth-outreach/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Scheduled separately after explicit activation; never scheduled by this PR. */
export async function GET(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  const secret=process.env.CRON_SECRET;
  if(!secret)return NextResponse.json({error:'Cron is not configured'},{status:503});
  const req=new Request(new URL('/api/internal/growth-outreach',request.url),{
    method:'POST',headers:{authorization:`Bearer ${secret}`}
  });
  return outreach(req);
}
