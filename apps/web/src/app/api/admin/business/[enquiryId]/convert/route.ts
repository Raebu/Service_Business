import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

export async function POST(_:Request,{params}:{params:Promise<{enquiryId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const {enquiryId}=await params;
    const supabase=getAdminSupabase();
    const {data:organisationId,error}=await supabase.rpc('convert_business_enquiry',{p_enquiry_id:enquiryId});
    if(error)return NextResponse.json({error:'Unable to convert business enquiry.',detail:error.message},{status:409});
    await supabase.from('audit_events').insert({actor_user_id:admin.user.id,event_type:'business_enquiry.converted',entity_type:'business_enquiry',entity_id:enquiryId,metadata:{organisationId}});
    return NextResponse.json({ok:true,organisationId});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to convert business enquiry.'},{status:500});
  }
}
