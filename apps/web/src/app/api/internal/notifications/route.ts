import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';
import { deliverNotification } from '@/lib/notifications';

export const runtime='nodejs';
const DEFAULT_BATCH_SIZE=25;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    await supabase.rpc('recover_stale_notification_claims');
    const requested=Number(new URL(request.url).searchParams.get('limit')||DEFAULT_BATCH_SIZE);
    const limit=Math.max(1,Math.min(100,Number.isFinite(requested)?Math.floor(requested):DEFAULT_BATCH_SIZE));
    const {data:claimed,error}=await supabase.rpc('claim_notification_batch',{p_limit:limit});
    if(error)return NextResponse.json({error:'Unable to claim notification work.',detail:error.message},{status:500});

    const results:Array<Record<string,unknown>>=[];
    for(const row of claimed||[]){
      try{
        const delivered=await deliverNotification({
          id:row.id,
          recipient_email:row.recipient_email,
          channel:row.channel,
          template_key:row.template_key,
          payload:(row.payload||{}) as Record<string,unknown>
        });
        const {error:completeError}=await supabase.rpc('complete_notification_delivery',{p_notification_id:row.id,p_provider_message_id:delivered.providerMessageId});
        if(completeError)throw new Error(`delivery_record_complete_failed:${completeError.message}`);
        results.push({id:row.id,status:'sent',providerMessageId:delivered.providerMessageId});
      }catch(error){
        const message=error instanceof Error?error.message:'Notification delivery failed';
        await supabase.rpc('fail_notification_delivery',{p_notification_id:row.id,p_error:message});
        results.push({id:row.id,status:'failed',error:message});
      }
    }

    const sent=results.filter(result=>result.status==='sent').length;
    const failed=results.filter(result=>result.status==='failed').length;
    return NextResponse.json({claimed:results.length,sent,failed,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production notification storage is not configured.'},{status:503});
    return NextResponse.json({error:'Notification worker failed.'},{status:500});
  }
}
