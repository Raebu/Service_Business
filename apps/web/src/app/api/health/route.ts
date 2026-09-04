import { NextResponse } from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const required=[
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
] as const;

const optional=[
  'RESEND_API_KEY',
  'NOTIFICATION_FROM_EMAIL',
  'NOTIFICATION_REPLY_TO',
  'ROUTING_BASE_URL',
  'ROUTING_API_KEY',
  'ROUTING_API_KEY_PARAM',
  'ROUTING_SOURCE_NAME'
] as const;

export async function GET(){
  const missingRequired=required.filter(key=>!process.env[key]);
  const configuredOptional=optional.filter(key=>Boolean(process.env[key]));
  const capabilities={
    database:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),
    auth:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    payments:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    workers:Boolean(process.env.CRON_SECRET),
    email:Boolean(process.env.RESEND_API_KEY&&process.env.NOTIFICATION_FROM_EMAIL),
    routing:Boolean(process.env.ROUTING_BASE_URL)
  };
  const ready=missingRequired.length===0;
  return NextResponse.json({
    service:'national-electrician-hub',
    status:ready?'ready':'configuration_required',
    ready,
    missingRequired,
    configuredOptional,
    capabilities,
    checkedAt:new Date().toISOString()
  },{status:ready?200:503,headers:{'cache-control':'no-store'}});
}
