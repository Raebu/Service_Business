import { NextResponse } from 'next/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const REMINDER_DAYS=[30,14,7,1] as const;
const DAY_MS=86_400_000;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const now=new Date();
    const maxExpiry=new Date(now.getTime()+31*DAY_MS).toISOString();
    const {data:upcoming,error:upcomingError}=await supabase
      .from('provider_evidence')
      .select('id,provider_id,label,kind,expires_at,providers(application_id,provider_applications(email,contact_name,business_name))')
      .eq('status','verified')
      .not('expires_at','is',null)
      .gt('expires_at',now.toISOString())
      .lte('expires_at',maxExpiry);
    if(upcomingError)return NextResponse.json({error:'Unable to load upcoming compliance expiries.',detail:upcomingError.message},{status:500});

    let queuedReminders=0;
    for(const evidence of upcoming||[]){
      const expiresAt=new Date(evidence.expires_at as string);
      const daysRemaining=Math.max(0,Math.ceil((expiresAt.getTime()-now.getTime())/DAY_MS));
      const reminderDay=REMINDER_DAYS.find(day=>daysRemaining<=day&&daysRemaining>day-1);
      if(!reminderDay)continue;
      const provider=evidence.providers as unknown as {application_id?:string|null;provider_applications?:{email?:string|null;contact_name?:string|null;business_name?:string|null}|null}|null;
      const application=provider?.provider_applications;
      if(!application?.email)continue;
      const {error:queueError}=await supabase.rpc('queue_notification_once',{
        p_dedupe_key:`provider.compliance_expiring:${evidence.id}:${reminderDay}`,
        p_recipient_user_id:null,
        p_recipient_email:application.email,
        p_channel:'email',
        p_template_key:'provider.compliance_expiring',
        p_payload:{evidenceId:evidence.id,providerId:evidence.provider_id,label:evidence.label||evidence.kind,expiresAt:expiresAt.toLocaleDateString('en-GB'),daysRemaining,businessName:application.business_name,contactName:application.contact_name},
        p_scheduled_at:now.toISOString()
      });
      if(!queueError)queuedReminders++;
    }

    const {data,error}=await supabase.rpc('process_expired_provider_evidence');
    if(error)return NextResponse.json({error:'Compliance sweep failed.',detail:error.message},{status:500});
    return NextResponse.json({ok:true,queuedReminders,expirySweep:data});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Compliance sweep failed.'},{status:500});
  }
}
