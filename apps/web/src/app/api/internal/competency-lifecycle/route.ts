import { NextResponse } from 'next/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.rpc('refresh_all_engineer_competency_statuses');
    if(error)return NextResponse.json({error:'Unable to refresh engineer competency status.',detail:error.message},{status:500});
    return NextResponse.json({ok:true,updatedEngineers:Number(data||0),checkedAt:new Date().toISOString()});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Competency lifecycle worker failed.'},{status:500});
  }
}
