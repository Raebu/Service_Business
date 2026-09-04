import { createHash,randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { classifyElectricalService,electricalVertical } from '@service-business/electrical';
import { postcodeArea } from '@service-business/platform';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { formatZodError, jobIntakeSchema } from '@/lib/schemas';

const electricalHazard=/(electric shock|electrocut|smoke|electrical fire|exposed live|live wire|sparking meter|meter fire|supply cable)/i;
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');

export async function POST(request:Request){
  try{
    const parsed=jobIntakeSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Please check the booking details.',fields:formatZodError(parsed.error)},{status:400});
    const input=parsed.data;
    if(electricalHazard.test(input.description)){
      return NextResponse.json({status:'safety_escalation',bookable:false,message:'This description may involve an immediate electrical hazard. Do not attempt repairs or touch exposed electrical equipment. Move away from the hazard and contact the appropriate emergency or electricity-network service.'},{status:422});
    }
    const serviceKey=input.serviceKey||classifyElectricalService(input.description);
    const area=postcodeArea(input.postcode);
    const supabase=getAdminSupabase();
    const {data:coverage,error:coverageError}=await supabase.from('service_areas').select('status').eq('vertical_id',electricalVertical.id).eq('area',area).maybeSingle();
    if(coverageError)return NextResponse.json({error:'Unable to confirm service coverage.'},{status:500});
    if(!coverage||coverage.status!=='live'){
      const {error:waitlistError}=await supabase.from('coverage_waitlist').insert({vertical_id:electricalVertical.id,area,postcode:input.postcode,customer_name:input.customerName,email:input.email,phone:input.phone,description:input.description});
      if(waitlistError)return NextResponse.json({error:'Unable to record your coverage request.'},{status:500});
      return NextResponse.json({status:'coverage_waitlist',bookable:false,area,serviceKey,message:'We are still building verified electrician coverage in your area. Your request has been recorded so local demand can drive provider recruitment.'},{status:202});
    }
    const {data:property,error:propertyError}=await supabase.from('properties').insert({address:input.address,postcode:input.postcode,latitude:input.latitude??null,longitude:input.longitude??null}).select('id').single();
    if(propertyError)return NextResponse.json({error:'Unable to create the property record.'},{status:500});
    const bookingToken=randomBytes(32).toString('base64url');
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
      service_key:serviceKey,
      latitude:input.latitude??null,
      longitude:input.longitude??null,
      schedule_mode:input.scheduleMode,
      requested_start:input.requestedStart||null,
      requested_end:input.requestedEnd||null,
      customer_access_token_hash:hashToken(bookingToken),
      status:'new'
    }).select('id,status,service_key,schedule_mode,requested_start,requested_end,created_at').single();
    if(jobError)return NextResponse.json({error:'Unable to create the job request.'},{status:500});
    const timing=input.scheduleMode==='asap'?'ASAP':input.scheduleMode==='exact'?'the requested appointment time':'the requested time window';
    return NextResponse.json({job,bookingToken,bookable:true,area,serviceKey,message:`Request received as ${serviceKey}. This area is live and the job can now enter verified-provider matching for ${timing}.`},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Bookings are not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to process the booking request.'},{status:500});
  }
}
