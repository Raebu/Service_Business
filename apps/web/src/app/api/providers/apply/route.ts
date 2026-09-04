import { NextResponse } from 'next/server';
import { electricalVertical } from '@service-business/electrical';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { formatZodError, providerApplicationSchema } from '@/lib/schemas';

export async function POST(request:Request){
  try{
    const parsed=providerApplicationSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Please check the application details.',fields:formatZodError(parsed.error)},{status:400});
    const input=parsed.data;
    const supabase=getAdminSupabase();
    const {data:existing,error:lookupError}=await supabase.from('provider_applications').select('id,status').eq('vertical_id',electricalVertical.id).ilike('email',input.email).not('status','eq','rejected').limit(1);
    if(lookupError)return NextResponse.json({error:'Unable to check an existing application.'},{status:500});
    if(existing?.length)return NextResponse.json({error:'An active application already exists for this email.',applicationId:existing[0].id,status:existing[0].status},{status:409});
    const {data,error}=await supabase.from('provider_applications').insert({
      vertical_id:electricalVertical.id,
      business_name:input.businessName,
      contact_name:input.contactName,
      email:input.email,
      phone:input.phone,
      website:input.website||null,
      company_number:input.companyNumber||null,
      coverage_areas:input.coverageAreas.map(v=>v.toUpperCase()),
      services:input.services,
      scheme_details:input.schemeDetails||null,
      insurance_expiry:input.insuranceExpiry||null,
      can_take_apprentice:input.canTakeApprentice,
      status:'submitted'
    }).select('id,status,created_at').single();
    if(error)return NextResponse.json({error:'Unable to save the application.'},{status:500});
    await supabase.rpc('queue_notification',{
      p_recipient_user_id:null,
      p_recipient_email:input.email,
      p_channel:'email',
      p_template_key:'provider.application_received',
      p_payload:{applicationId:data.id,businessName:input.businessName,contactName:input.contactName},
      p_scheduled_at:new Date().toISOString()
    });
    return NextResponse.json({application:data,message:'Application received. Verification begins before any customer work can be allocated.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Provider applications are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to process the application.'},{status:500});
  }
}
