import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { getStripeClient, StripeConfigurationError } from '@/lib/stripe';

const schema=z.object({organisationId:z.string().uuid()});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid business account.'},{status:400});
  const userSupabase=await getUserSupabase();
  if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',parsed.data.organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership)return NextResponse.json({error:'Business membership required.'},{status:403});

  try{
    const admin=getAdminSupabase();
    const {data:provider}=await admin.from('providers').select('id,stripe_account_id').eq('organisation_id',parsed.data.organisationId).maybeSingle();
    if(!provider)return NextResponse.json({error:'Provider business not found.'},{status:404});
    if(!provider.stripe_account_id)return NextResponse.json({status:'not_started',transfersActive:false});
    const stripe=getStripeClient();
    const account=await stripe.v2.core.accounts.retrieve(provider.stripe_account_id,{include:['configuration.recipient','requirements']});
    const raw=account as unknown as Record<string,any>;
    const transferState=raw.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    const transfersActive=transferState==='active';
    const requirements=raw.requirements||{};
    const hasRequirements=Array.isArray(requirements?.currently_due)?requirements.currently_due.length>0:Boolean(requirements?.summary?.minimum_deadline);
    const status=transfersActive?'active':hasRequirements?'restricted':'pending';
    await admin.from('providers').update({stripe_account_status:status,stripe_transfers_active:transfersActive,stripe_requirements:requirements,stripe_updated_at:new Date().toISOString()}).eq('id',provider.id);
    return NextResponse.json({status,transfersActive,requirements,transferState});
  }catch(error){
    if(error instanceof SupabaseConfigurationError||error instanceof StripeConfigurationError)return NextResponse.json({error:'Payment onboarding is not configured.'},{status:503});
    return NextResponse.json({error:'Unable to sync payment account.'},{status:500});
  }
}
