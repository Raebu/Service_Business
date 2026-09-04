alter table public.reviews
  add column if not exists moderation_status text not null default 'pending' check (moderation_status in ('pending','published','rejected')),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.profiles(id) on delete set null,
  recipient_email text,
  channel text not null check (channel in ('email','sms','push','webhook')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_user_id is not null or recipient_email is not null)
);

create index notification_outbox_ready_idx on public.notification_outbox(status,scheduled_at) where status in ('pending','failed');

alter table public.notification_outbox enable row level security;

create or replace function public.queue_notification(
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_channel text,
  p_template_key text,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  insert into public.notification_outbox(recipient_user_id,recipient_email,channel,template_key,payload,scheduled_at)
  values(p_recipient_user_id,p_recipient_email,p_channel,p_template_key,coalesce(p_payload,'{}'::jsonb),coalesce(p_scheduled_at,now()))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.queue_notification(uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.queue_notification(uuid,text,text,text,jsonb,timestamptz) to service_role;
