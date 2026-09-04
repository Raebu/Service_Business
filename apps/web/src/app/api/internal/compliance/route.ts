import { NextResponse } from 'next/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const REMINDER_DAYS=[30,14,7,1] as const;
const DAY_MS=86_400_000;

type EngineerJoin={id:string;email:string|null;display_name:string|null;organisation_id:string};

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

    const {data:upcomingCompetencies,error:competencyUpcomingError}=await supabase
      .from('engineer_competencies')
      .select('id,engineer_id,service_key,competency_level,expires_at,engineers(id,email,display_name,organisation_id)')
      .eq('verified',true)
      .not('expires_at','is',null)
      .gt('expires_at',now.toISOString())
      .lte('expires_at',maxExpiry);
    if(competencyUpcomingError)return NextResponse.json({error:'Unable to load engineer competency expiries.',detail:competencyUpcomingError.message},{status:500});

    let queuedCompetencyReminders=0;
    for(const competency of upcomingCompetencies||[]){
      const expiresAt=new Date(competency.expires_at as string);
      const daysRemaining=Math.max(0,Math.ceil((expiresAt.getTime()-now.getTime())/DAY_MS));
      const reminderDay=REMINDER_DAYS.find(day=>daysRemaining<=day&&daysRemaining>day-1);
      if(!reminderDay)continue;
      const engineer=competency.engineers as unknown as EngineerJoin|null;
      if(!engineer?.email)continue;
      const {error:queueError}=await supabase.rpc('queue_notification_once',{
        p_dedupe_key:`engineer.competency_expiring:${competency.id}:${reminderDay}`,
        p_recipient_user_id:null,
        p_recipient_email:engineer.email,
        p_channel:'email',
        p_template_key:'provider.compliance_expiring',
        p_payload:{evidenceId:competency.id,label:`${competency.service_key} competency (${competency.competency_level})`,expiresAt:expiresAt.toLocaleDateString('en-GB'),daysRemaining,contactName:engineer.display_name},
        p_scheduled_at:now.toISOString()
      });
      if(!queueError)queuedCompetencyReminders++;
    }

    const {data:expiredCompetencies,error:expiredCompetenciesError}=await supabase
      .from('engineer_competencies')
      .select('id,engineer_id,service_key,expires_at')
      .eq('verified',true)
      .not('expires_at','is',null)
      .lte('expires_at',now.toISOString());
    if(expiredCompetenciesError)return NextResponse.json({error:'Unable to load expired engineer competencies.',detail:expiredCompetenciesError.message},{status:500});

    const expiredIds=(expiredCompetencies||[]).map(row=>row.id);
    if(expiredIds.length){
      const {error:updateError}=await supabase.from('engineer_competencies').update({verified:false,updated_at:now.toISOString()}).in('id',expiredIds);
      if(updateError)return NextResponse.json({error:'Unable to expire engineer competencies.',detail:updateError.message},{status:500});
    }
    const affectedEngineerIds=[...new Set((expiredCompetencies||[]).map(row=>row.engineer_id))];
    for(const engineerId of affectedEngineerIds){
      const {data:stillUnsupervised,error:refreshError}=await supabase.rpc('refresh_engineer_unsupervised_status',{p_engineer_id:engineerId});
      if(refreshError)return NextResponse.json({error:'Unable to refresh engineer dispatch eligibility.',detail:refreshError.message},{status:500});
      await supabase.from('audit_events').insert({event_type:'engineer.competency_expired',entity_type:'engineer',entity_id:engineerId,metadata:{expiredCompetencyIds:(expiredCompetencies||[]).filter(row=>row.engineer_id===engineerId).map(row=>row.id),canWorkUnsupervised:Boolean(stillUnsupervised)}});
    }

    const {data,error}=await supabase.rpc('process_expired_provider_evidence');
    if(error)return NextResponse.json({error:'Compliance sweep failed.',detail:error.message},{status:500});
    return NextResponse.json({ok:true,queuedReminders,queuedCompetencyReminders,expiredCompetencies:expiredIds.length,affectedEngineers:affectedEngineerIds.length,expirySweep:data});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Compliance sweep failed.'},{status:500});
  }
}
