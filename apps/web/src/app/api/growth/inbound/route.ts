import {NextResponse} from 'next/server';
import {verifyResendSignature,classifyGrowthReply} from '@/lib/growth';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// This endpoint is exclusively for a dedicated, verified Resend growth webhook.
// Never point every account's transactional traffic to this handler.
export async function POST(request:Request){
  const raw=await request.text();
  if(raw.length>200_000)return NextResponse.json({error:'Payload too large'},{status:413});
  const secret=process.env.GROWTH_RESEND_WEBHOOK_SECRET;
  if(!secret||!verifyResendSignature(raw,{
    id:request.headers.get('svix-id'),timestamp:request.headers.get('svix-timestamp'),
    signature:request.headers.get('svix-signature')
  },secret))return NextResponse.json({error:'Invalid signature'},{status:401});
  try{
    const event=JSON.parse(raw) as {
      type?:string;data?:{email_id?:string;from?:string;to?:string[];subject?:string;message_id?:string}
    };
    const supported=['email.received','email.bounced','email.complained','email.suppressed'];
    if(!event.type||!supported.includes(event.type))return NextResponse.json({ignored:true});
    const db=getAdminSupabase();
    const {data:flags,error:flagsError}=await db.from('growth_controls').select('inbound_enabled').eq('id',true).single();
    if(flagsError)return NextResponse.json({error:'Growth settings unavailable'},{status:503});
    if(!flags.inbound_enabled)return NextResponse.json({enabled:false});

    const data=event.data||{};
    const id=data.email_id||request.headers.get('svix-id');
    if(!id)return NextResponse.json({error:'Missing message ID'},{status:400});
    let sender=(data.from||'').match(/<([^<>\s]+@[^<>\s]+)>/)?.[1]||data.from||'';
    sender=sender.trim().toLowerCase();
    const destination=(data.to?.[0]||'').trim().toLowerCase();

    if(event.type!=='email.received'){
      const affected=destination;
      if(affected&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(affected)){
        const {error}=await db.rpc('suppress_growth_email',{p_email:affected,p_reason:event.type,p_source:'resend_webhook'});
        if(error)return NextResponse.json({error:'Unable to suppress bounced address'},{status:503});
      }
      return NextResponse.json({suppressed:Boolean(affected)});
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender))
      return NextResponse.json({ignored:true,reason:'sender_not_email'});
    // Subject-only analysis is deliberately conservative until the full message is
    // retrieved with the inbound read API. Never send an autonomous AI reply here.
    const classification=classifyGrowthReply(data.subject||'','');
    const {error:insertError}=await db.from('growth_inbound_messages').insert({
      provider_message_id:id,sender_email:sender,recipient_email:destination||null,
      subject:(data.subject||'').slice(0,300),text_excerpt:null,classification,processed:false
    });
    if(insertError?.code==='23505')return NextResponse.json({received:true,duplicate:true});
    if(insertError)return NextResponse.json({error:'Unable to record inbound message'},{status:503});
    const {error:leadError}=await db.from('growth_outreach_queue')
      .update({replied_at:new Date().toISOString(),next_contact_at:null,status:'replied',updated_at:new Date().toISOString()})
      .eq('direct_email',sender).in('status',['ready','contacted']);
    if(leadError)return NextResponse.json({error:'Unable to pause replied contacts'},{status:503});
    if(classification==='unsubscribe'||classification==='not_interested'){
      const {error}=await db.rpc('suppress_growth_email',{
        p_email:sender,p_reason:classification,p_source:'inbound_reply_subject'
      });
      if(error)return NextResponse.json({error:'Unable to apply reply suppression'},{status:503});
    }
    return NextResponse.json({received:true,triage:'human_review',classification});
  }catch{
    return NextResponse.json({error:'Inbound growth event processing failed'},{status:503});
  }
}
