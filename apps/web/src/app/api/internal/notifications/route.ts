import {NextResponse} from 'next/server';
import {getAdminSupabase,SupabaseConfigurationError} from '@/lib/supabase/admin';
import {internalRequestAuthorised} from '@/lib/internal';
import {deliverNotification} from '@/lib/notifications';

export const runtime='nodejs';
const DEFAULT_BATCH_SIZE=25;

export async function POST(request:Request){
 if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
 try{
  const supabase=getAdminSupabase();
  const {error:recoverError}=await supabase.rpc('recover_stale_notification_claims');
  if(recoverError)return NextResponse.json({error:'Unable to recover notification claims'},{status:503});
  const requested=Number(new URL(request.url).searchParams.get('limit')||DEFAULT_BATCH_SIZE);
  const limit=Math.max(1,Math.min(100,Number.isFinite(requested)?Math.floor(requested):DEFAULT_BATCH_SIZE));
  const {data:claimed,error}=await supabase.rpc('claim_notification_batch',{p_limit:limit});
  if(error)return NextResponse.json({error:'Unable to claim notification work'},{status:503});
  const results:Array<{id:string;status:'sent'|'failed';reason?:string}>=[];
  for(const row of claimed||[]){
   try{
    const delivered=await deliverNotification({
      id:row.id,recipient_email:row.recipient_email,channel:row.channel,
      template_key:row.template_key,payload:(row.payload||{}) as Record<string,unknown>
    });
    const {error:completeError}=await supabase.rpc('complete_notification_delivery',{
      p_notification_id:row.id,p_provider_message_id:delivered.providerMessageId
    });
    if(completeError)throw new Error('delivery_reconciliation_failed');
    results.push({id:row.id,status:'sent'});
   }catch(error){
    const reason=error instanceof Error&&error.message==='delivery_reconciliation_failed'
      ?'delivery_reconciliation_failed':'delivery_attempt_failed';
    // Never put raw provider errors, personal details or credentials in audit output.
    const {error:failedError}=await supabase.rpc('fail_notification_delivery',{
      p_notification_id:row.id,p_error:reason
    });
    if(failedError)return NextResponse.json({
      error:'Notification delivery and failure audit require reconciliation',
      completed:results.filter(x=>x.status==='sent').length
    },{status:503});
    results.push({id:row.id,status:'failed',reason});
   }
  }
  const sent=results.filter(x=>x.status==='sent').length;
  const failed=results.length-sent;
  return NextResponse.json({claimed:results.length,sent,failed,results},
    {status:failed?503:200,headers:{'cache-control':'no-store'}});
 }catch(error){
  if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Notification database unavailable'},{status:503});
  return NextResponse.json({error:'Notification worker failed'},{status:503});
 }
}
