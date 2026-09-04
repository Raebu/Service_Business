-- Prevent duplicate transactional notifications when recurring workers replay the same event.

alter table public.notification_outbox
  add column if not exists dedupe_key text;

create unique index if not exists notification_outbox_dedupe_uidx
  on public.notification_outbox(dedupe_key)
  where dedupe_key is not null;

create or replace function public.queue_notification_once(
  p_dedupe_key text,
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
  if nullif(trim(p_dedupe_key),'') is null then raise exception 'notification_dedupe_key_required'; end if;
  insert into public.notification_outbox(dedupe_key,recipient_user_id,recipient_email,channel,template_key,payload,scheduled_at)
  values(trim(p_dedupe_key),p_recipient_user_id,p_recipient_email,p_channel,p_template_key,coalesce(p_payload,'{}'::jsonb),coalesce(p_scheduled_at,now()))
  on conflict (dedupe_key) where dedupe_key is not null do update set dedupe_key=excluded.dedupe_key
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.queue_notification_once(text,uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.queue_notification_once(text,uuid,text,text,text,jsonb,timestamptz) to service_role;
