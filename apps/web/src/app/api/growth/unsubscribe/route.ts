import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const page=(message:string,token:string)=>`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Raeburn Services preferences</title></head>
<body style="max-width:520px;margin:4rem auto;padding:1rem;font-family:Arial,sans-serif">
<h1>Email preferences</h1><p>${message}</p><form method="post">
<input type="hidden" name="token" value="${token}">
<button style="padding:.8rem 1.4rem" type="submit">Stop marketing emails</button></form></body></html>`;

export async function GET(request:Request){
  const token=new URL(request.url).searchParams.get('token')||'';
  if(!uuid.test(token))return new NextResponse('Invalid preference link',{status:400});
  return new NextResponse(page('You can stop future marketing emails from Raeburn Services.',token),{
    headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex'}
  });
}
export async function POST(request:Request){
  try{
    const type=request.headers.get('content-type')||'';
    const token=type.includes('application/json')?
      String((await request.json() as {token?:string}).token||''):
      String((await request.formData()).get('token')||new URL(request.url).searchParams.get('token')||'');
    if(!uuid.test(token))return NextResponse.json({error:'Invalid token'},{status:400});
    const db=getAdminSupabase();
    const {data,error}=await db.rpc('unsubscribe_growth_token',{p_token:token});
    if(error)return NextResponse.json({error:'Preference update unavailable'},{status:503});
    if(!data)return NextResponse.json({error:'Preference link not found'},{status:404});
    if(type.includes('application/json')||request.headers.get('list-unsubscribe')==='One-Click')
      return NextResponse.json({unsubscribed:true});
    return new NextResponse('<h1>Unsubscribed</h1><p>Marketing emails have been stopped for this address.</p>',{
      headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
    });
  }catch{return NextResponse.json({error:'Unable to change preferences'},{status:503});}
}
