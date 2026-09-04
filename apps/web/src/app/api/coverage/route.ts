import { NextResponse } from 'next/server';
import { electricalVertical } from '@service-business/electrical';
import { postcodeArea } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    const postcode=url.searchParams.get('postcode')||'';
    if(!postcode.trim())return NextResponse.json({error:'Postcode is required.'},{status:400});
    const area=postcodeArea(postcode);
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.from('service_areas').select('area,status,verified_providers,fill_rate,median_match_minutes,updated_at').eq('vertical_id',electricalVertical.id).eq('area',area).maybeSingle();
    if(error)return NextResponse.json({error:'Unable to check coverage.'},{status:500});
    if(!data)return NextResponse.json({area,status:'closed',bookable:false,message:'This area is not yet active.'});
    return NextResponse.json({...data,bookable:data.status==='live',message:data.status==='live'?'This area is live.':'We are still building verified coverage in this area.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Coverage data is not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to check coverage.'},{status:500});
  }
}
