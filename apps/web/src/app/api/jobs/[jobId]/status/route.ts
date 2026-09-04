import { NextResponse } from 'next/server';
import { customerMayAccessJob } from '@/lib/job-access';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

export async function GET(request:Request,{params}:{params:Promise<{jobId:string}>}){
  try{
    const {jobId}=await params;
    const token=new URL(request.url).searchParams.get('token');
    if(!await customerMayAccessJob(jobId,token))return NextResponse.json({error:'Booking access denied.'},{status:403});
    const supabase=getAdminSupabase();
    const {data:job,error}=await supabase.from('jobs').select('id,status,service_key,urgency,schedule_mode,requested_start,requested_end,provider_price_pence,platform_fee_pence,customer_total_pence,currency,payment_status,settlement_status,matched_provider_id,assigned_engineer_id,updated_at').eq('id',jobId).maybeSingle();
    if(error||!job)return NextResponse.json({error:'Booking not found.'},{status:404});
    let provider:null|{name:string;publicSlug:string}=null;
    let engineer:null|{displayName:string}=null;
    if(job.matched_provider_id){
      const {data:p}=await supabase.from('providers').select('public_slug,organisation_id,organisations(name)').eq('id',job.matched_provider_id).maybeSingle();
      if(p)provider={name:(p.organisations as unknown as {name?:string}|null)?.name||'Verified electrical business',publicSlug:p.public_slug};
    }
    if(job.assigned_engineer_id){
      const {data:e}=await supabase.from('engineers').select('display_name').eq('id',job.assigned_engineer_id).maybeSingle();
      if(e)engineer={displayName:e.display_name};
    }
    const quote=job.customer_total_pence==null?null:{providerPricePence:Number(job.provider_price_pence),platformFeePence:Number(job.platform_fee_pence),customerTotalPence:Number(job.customer_total_pence),currency:job.currency||'GBP',providerReceivesPence:Number(job.provider_price_pence)};
    return NextResponse.json({jobId:job.id,status:job.status,serviceKey:job.service_key,urgency:job.urgency,schedule:{mode:job.schedule_mode,start:job.requested_start,end:job.requested_end},quote,paymentStatus:job.payment_status,settlementStatus:job.settlement_status,provider,engineer,readyToPay:job.status==='accepted'&&job.payment_status==='unpaid'&&Boolean(quote),updatedAt:job.updated_at});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to load booking status.'},{status:500});
  }
}
