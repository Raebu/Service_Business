import { NextResponse } from 'next/server';
import { electricalVertical } from '@service-business/electrical';
import { postcodeArea } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { formatZodError, jobIntakeSchema } from '@/lib/schemas';

const electricalHazard=/(electric shock|electrocut|smoke|electrical fire|exposed live|live wire|sparking meter|meter fire|supply cable)/i;

export async function POST(request:Request){
  try{
    const parsed=jobIntakeSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Please check the booking details.',fields:formatZodError(parsed.error)},{status:400});
    const input=parsed.data;
    if(electricalHazard.test(input.description)){
      return NextResponse.json({status:'safety_escalation',bookable:false,message:'This description may involve an immediate electrical hazard. Do not attempt repairs or touch exposed electrical equipment. Move away from the hazard and contact the appropriate emergency or electricity-network service.'},{status:422});
    }
    const area=postcodeArea(input.postcode);
    const supabase=getAdminSupabase();
    const {data:coverage,error:coverageError}=await supabase.from('service_areas').select('status').eq('vertical_id',electricalVertical.id).eq('area',area).maybeSingle();
    if(coverageError)return NextResponse.json({error:'Unable to confirm service coverage.'},{status:500});
    if(!coverage||coverage.status!=='live'){
      const {error:waitlistError}=await supabase.from('coverage_waitlist').insert({vertical_id:electricalVertical.id,area,postcode:input.postcode,customer_name:input.customerName,email:input.email,phone:input.phone,description:input.description});
      if(waitlistError)return NextResponse.json({error:'Unable to record your coverage request.'},{status:500});
      return NextResponse.json({status:'coverage_waitlist',bookable:false,area,message:'We are still building verified electrician coverage in your area. Your request has been recorded so local demand can drive provider recruitment.'},{status:202});
    }
    const {data:property,error:propertyError}=await supabase.from('properties').insert({address:input.address,postcode:input.postcode}).select('id').single();
    if(propertyError)return NextResponse.json({error:'Unable to create the property record.'},{status:500});
    const {data:job,error:jobError}=await supabase.from('jobs').insert({
      vertical_id:electricalVertical.id,
      property_id:property.id,
      customer_name:input.customerName,
      email:input.email,
      phone:input.phone,
      postcode:input.postcode,
      address:input.address,
      description:input.description,
      urgency:input.urgency,
      preferred_window:input.preferredWindow||null,
      service_key:input.serviceKey||null,
      status:'new'
    }).select('id,status,created_at').single();
    if(jobError)return NextResponse.json({error:'Unable to create the job request.'},{status:500});
    return NextResponse.json({job,bookable:true,area,message:'Request received. This area is live and the job can now enter verified-provider matching.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Bookings are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to process the booking request.'},{status:500});
  }
}
