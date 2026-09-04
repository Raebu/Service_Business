import { NextResponse } from 'next/server';
import { electricalVertical } from '@service-business/electrical';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { businessEnquirySchema, formatZodError } from '@/lib/schemas';

export async function POST(request:Request){
  try{
    const parsed=businessEnquirySchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Please check the business enquiry details.',fields:formatZodError(parsed.error)},{status:400});
    const input=parsed.data;
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.from('business_enquiries').insert({
      vertical_id:electricalVertical.id,
      organisation:input.organisation,
      contact_name:input.contactName,
      email:input.email,
      phone:input.phone||null,
      segment:input.segment,
      sites:input.sites,
      requirements:input.requirements,
      status:'new'
    }).select('id,status,created_at').single();
    if(error)return NextResponse.json({error:'Unable to save the business enquiry.'},{status:500});
    return NextResponse.json({enquiry:data,message:'Business enquiry received. It is now in the managed-service pipeline.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Business enquiries are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to process the business enquiry.'},{status:500});
  }
}
