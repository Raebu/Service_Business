import { NextResponse } from 'next/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

function authorised(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret)return false;
  const auth=request.headers.get('authorization');
  return auth===`Bearer ${secret}`;
}

export async function POST(request:Request){
  if(!authorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.rpc('process_expired_provider_evidence');
    if(error)return NextResponse.json({error:'Compliance sweep failed.',detail:error.message},{status:500});
    return NextResponse.json({ok:true,result:data});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Compliance sweep failed.'},{status:500});
  }
}
