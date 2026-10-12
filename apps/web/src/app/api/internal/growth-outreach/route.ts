import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {internalRequestAuthorised} from '@/lib/internal';
import {renderGrowthEmail} from '@/lib/growth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type Claimed={
  attempt_id:string;prospect_id:string;campaign_id:string;email:string;
  contact_name:string;organisation_name:string|null;workstream:string;opt_out_token:string;
};

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  if(process.env.ENABLE_AUTONOMOUS_OUTREACH!=='true')
    return NextResponse.json({enabled:false,sent:0,reason:'Outreach sender is disabled'});
  const apiKey=process.env.RESEND_API_KEY;
  const sender=process.env.GROWTH_OUTREACH_FROM_EMAIL;
  const origin=process.env.NEXT_PUBLIC_SITE_URL;
  if(!apiKey||!sender||!origin||!origin.startsWith('https://'))
    return NextResponse.json({error:'Outreach sending configuration is incomplete'},{status:503});
  try{
    const db=getAdminSupabase();
    const {data:settings,error:settingsError}=await db.from('growth_controls')
      .select('outbound_enabled').eq('id',true).single();
    if(settingsError)return NextResponse.json({error:'Growth controls not available'},{status:503});
    if(!settings.outbound_enabled)return NextResponse.json({enabled:false,sent:0});
    const {data:claimed,error:claimError}=await db.rpc('claim_growth_outreach_batch',{p_limit:5});
    if(claimError)return NextResponse.json({error:'Unable to claim outreach'}, {status:503});
    const results:Array<{attemptId:string;outcome:string}>=[];
    for(const row of (claimed||[]) as Claimed[]){
      let outcome:'sent'|'rejected'|'unknown'='unknown';
      let providerMessageId:string|null=null;
      let errorCode:string|null=null;
      try{
        const {data:campaign,error:campaignError}=await db.from('growth_campaigns')
          .select('status,subject_template,message_template,workstream').eq('id',row.campaign_id).single();
        if(campaignError||campaign?.status!=='approved'||campaign.workstream!==row.workstream)
          throw new Error('campaign_not_approved');
        const {data:prospect,error:prospectError}=await db.from('growth_outreach_queue')
          .select('area,service_key,status,direct_email').eq('id',row.prospect_id).single();
        if(prospectError||!prospect||prospect.direct_email?.toLowerCase()!==row.email.toLowerCase()
           ||prospect.status==='paused')throw new Error('prospect_not_eligible');
        const unsubscribeUrl=new URL('/api/growth/unsubscribe',origin);
        unsubscribeUrl.searchParams.set('token',row.opt_out_token);
        const message=renderGrowthEmail(
          {subject:campaign.subject_template,message:campaign.message_template},
          {contactName:row.contact_name,organisationName:row.organisation_name||'your business',
           area:prospect.area||'',serviceKey:prospect.service_key||'electrical services',
           unsubscribeUrl:unsubscribeUrl.toString()});
        const response=await fetch('https://api.resend.com/emails',{
          method:'POST',
          headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json',
            'Idempotency-Key':`growth-${row.attempt_id}`},
          body:JSON.stringify({from:sender,to:[row.email],subject:message.subject,text:message.text,
            html:message.html,reply_to:process.env.GROWTH_REPLY_TO_EMAIL||undefined,
            headers:{'List-Unsubscribe':`<${unsubscribeUrl.toString()}>`,
              'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),
          cache:'no-store'
        });
        const payload=await response.json().catch(()=>({})) as {id?:string};
        if(!response.ok||!payload.id){outcome='rejected';errorCode=`resend_http_${response.status}`;}
        else{outcome='sent';providerMessageId=payload.id;}
      }catch(error){
        // A network timeout after submission is ambiguous: pause, NEVER blindly resend.
        outcome=error instanceof Error&&['campaign_not_approved','prospect_not_eligible','invalid_growth_template'].includes(error.message)
          ?'rejected':'unknown';
        errorCode=outcome==='rejected'?'validation_failed':'delivery_outcome_unknown';
      }
      const {data:finished,error:finishError}=await db.rpc('finish_growth_outreach_attempt',{
        p_attempt_id:row.attempt_id,p_status:outcome,
        p_provider_message_id:providerMessageId,p_error_code:errorCode
      });
      if(finishError||!finished)
        return NextResponse.json({error:'Outreach audit reconciliation required',processed:results.length},
          {status:503});
      results.push({attemptId:row.attempt_id,outcome});
    }
    const sent=results.filter(x=>x.outcome==='sent').length;
    const failures=results.length-sent;
    const {error:logError}=await db.from('growth_automation_runs').insert({
      worker:'outreach_sender',status:failures?'partial_failure':'success',summary:{claimed:results.length,sent,failures}
    });
    if(logError)return NextResponse.json({error:'Unable to persist growth run audit'}, {status:503});
    return NextResponse.json({enabled:true,claimed:results.length,sent,failures},
      {status:failures?503:200});
  }catch{
    return NextResponse.json({error:'Growth outreach worker failed'}, {status:503});
  }
}
