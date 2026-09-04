import { NextResponse } from 'next/server';
import { electricalVertical } from '@service-business/electrical';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { academyInterestSchema, formatZodError } from '@/lib/schemas';

export async function POST(request:Request){
  try{
    const parsed=academyInterestSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Please check the Academy details.',fields:formatZodError(parsed.error)},{status:400});
    const input=parsed.data;
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.from('academy_interest').insert({
      vertical_id:electricalVertical.id,
      audience:input.audience,
      organisation_or_name:input.organisationOrName,
      email:input.email,
      postcode:input.postcode,
      details:input.details,
      status:'new'
    }).select('id,status,created_at').single();
    if(error)return NextResponse.json({error:'Unable to save the Academy interest.'},{status:500});
    return NextResponse.json({interest:data,message:'Thanks — your details are now in the Academy matching pipeline.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Academy registrations are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to process the Academy registration.'},{status:500});
  }
}
