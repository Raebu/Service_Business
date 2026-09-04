-- Atomic notification delivery claiming and retry controls.

alter table public.notification_outbox
  add column if not exists claimed_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists notification_outbox_delivery_idx
  on public.notification_outbox(status,coalesce(next_attempt_at,scheduled_at),attempts)
  where status in ('pending','failed','processing');

create or replace function public.claim_notification_batch(p_limit integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_limit<1 or p_limit>100 then raise exception 'notification_batch_limit_invalid'; end if;

  return query
  with candidates as (
    select n.id
    from public.notification_outbox n
    where n.status in ('pending','failed')
      and n.attempts<5
      and coalesce(n.next_attempt_at,n.scheduled_at)<=now()
    order by coalesce(n.next_attempt_at,n.scheduled_at),n.created_at
    for update skip locked
    limit p_limit
  )
  update public.notification_outbox n
  set status='processing',
      attempts=n.attempts+1,
      claimed_at=now(),
      updated_at=now()
  from candidates c
  where n.id=c.id
  returning n.*;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_notification_id uuid,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.notification_outbox
  set status='sent',sent_at=now(),provider_message_id=p_provider_message_id,last_error=null,next_attempt_at=null,updated_at=now()
  where id=p_notification_id and status='processing';
end;
$$;

create or replace function public.fail_notification_delivery(
  p_notification_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.notification_outbox where id=p_notification_id for update;
  if v_attempts is null then raise exception 'notification_not_found'; end if;
  if v_attempts>=5 then
    update public.notification_outbox
    set status='failed',last_error=left(coalesce(p_error,'delivery failed'),2000),dead_lettered_at=now(),next_attempt_at=null,updated_at=now()
    where id=p_notification_id;
  else
    update public.notification_outbox
    set status='failed',last_error=left(coalesce(p_error,'delivery failed'),2000),
        next_attempt_at=now()+(power(2,greatest(v_attempts-1,0))::text||' minutes')::interval,
        updated_at=now()
    where id=p_notification_id;
  end if;
end;
$$;

create or replace function public.recover_stale_notification_claims()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.notification_outbox
  set status='failed',last_error=coalesce(last_error,'Delivery claim timed out'),next_attempt_at=now(),updated_at=now()
  where status='processing' and claimed_at<now()-interval '15 minutes';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public,anon,authenticated;
revoke all on function public.complete_notification_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.fail_notification_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.recover_stale_notification_claims() from public,anon,authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;
grant execute on function public.complete_notification_delivery(uuid,text) to service_role;
grant execute on function public.fail_notification_delivery(uuid,text) to service_role;
grant execute on function public.recover_stale_notification_claims() to service_role;
