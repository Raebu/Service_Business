import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { createRecipientConnectedAccount, getStripeClient, StripeConfigurationError } from '@/lib/stripe';

const schema=z.object({organisationId:z.string().uuid()});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid business account.'},{status:400});
  const userSupabase=await getUserSupabase();
  if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',parsed.data.organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership||!['owner','admin','manager'].includes(membership.role))return NextResponse.json({error:'Business owner or manager access required.'},{status:403});

  try{
    const admin=getAdminSupabase();
    const [{data:org},{data:provider}]=await Promise.all([
      admin.from('organisations').select('id,name,kind,contact_email').eq('id',parsed.data.organisationId).maybeSingle(),
      admin.from('providers').select('id,stripe_account_id,stripe_account_status').eq('organisation_id',parsed.data.organisationId).maybeSingle()
    ]);
    if(!org||org.kind!=='provider_business'||!provider)return NextResponse.json({error:'Provider business not found.'},{status:404});
    const email=org.contact_email||user.email;
    if(!email)return NextResponse.json({error:'A business contact email is required before payment onboarding.'},{status:409});

    let accountId=provider.stripe_account_id as string|null;
    if(!accountId){
      const account=await createRecipientConnectedAccount({email,displayName:org.name,country:'gb',entityType:'company'});
      accountId=account.id;
      await admin.from('providers').update({stripe_account_id:accountId,stripe_account_status:'pending',stripe_transfers_active:false,stripe_updated_at:new Date().toISOString()}).eq('id',provider.id);
      await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'stripe.recipient_account_created',entity_type:'provider',entity_id:provider.id,metadata:{stripeAccountId:accountId}});
    }

    const stripe=getStripeClient();
    const session=await stripe.accountSessions.create({
      account:accountId,
      components:{
        account_onboarding:{enabled:true},
        account_management:{enabled:true},
        notification_banner:{enabled:true}
      }
    });
    return NextResponse.json({clientSecret:session.client_secret,accountId});
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Payment onboarding is not configured.'},{status:503});
    return NextResponse.json({error:'Unable to start payment onboarding.'},{status:500});
  }
}
