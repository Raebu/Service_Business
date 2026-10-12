import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {evidenceReminderStage} from '@/lib/growth-intelligence';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Transactional reminders only for applicants who requested provider onboarding. */
export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  if(process.env.ENABLE_PROVIDER_NURTURE!=='true')
    return NextResponse.json({enabled:false,queued:0});
  try{
    const db=getAdminSupabase(),now=new Date();
    const {data:applications,error}=await db.from('provider_applications')
      .select('id,business_name,contact_name,email,updated_at,status')
      .eq('status','evidence_required').lt('updated_at',new Date(now.getTime()-3*86400000).toISOString())
      .order('updated_at',{ascending:true}).limit(50);
    if(error)return NextResponse.json({error:'Cannot inspect applications'},{status:503});
    let queued=0,failed=0;
    for(const a of applications||[]){
      const stage=evidenceReminderStage(a.updated_at,now);
      if(!stage)continue;
      const {error:queueError}=await db.rpc('queue_notification_once',{
        p_dedupe_key:`provider.evidence_required_reminder:${a.id}:${stage}`,
        p_recipient_user_id:null,p_recipient_email:a.email,
        p_channel:'email',p_template_key:'provider.evidence_required_reminder',
        p_payload:{applicationId:a.id,contactName:a.contact_name,businessName:a.business_name},
        p_scheduled_at:now.toISOString()
      });
      if(queueError)failed++;else queued++;
    }
    return NextResponse.json({enabled:true,processed:applications?.length||0,queued,failed},
      {status:failed?503:200});
  }catch{return NextResponse.json({error:'Onboarding nurture worker failed'},{status:503});}
}
