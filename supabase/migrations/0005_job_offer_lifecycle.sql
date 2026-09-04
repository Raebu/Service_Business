create or replace function public.respond_to_job_offer(
  p_offer_id uuid,
  p_provider_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  offer_row public.job_offers%rowtype;
  job_row public.jobs%rowtype;
begin
  select * into offer_row
  from public.job_offers
  where id=p_offer_id and provider_id=p_provider_id
  for update;

  if offer_row.id is null then
    raise exception 'offer_not_found';
  end if;

  select * into job_row
  from public.jobs
  where id=offer_row.job_id
  for update;

  if job_row.id is null then
    raise exception 'job_not_found';
  end if;

  if p_action='accept' then
    if offer_row.status<>'offered' then raise exception 'offer_not_available'; end if;
    if offer_row.expires_at is not null and offer_row.expires_at<=now() then
      update public.job_offers set status='expired',responded_at=now() where id=offer_row.id;
      update public.jobs set status='new',updated_at=now() where id=job_row.id and status='offered';
      raise exception 'offer_expired';
    end if;
    if job_row.status not in ('new','offered') then raise exception 'job_not_available'; end if;

    update public.job_offers
    set status='accepted',responded_at=now()
    where id=offer_row.id;

    update public.job_offers
    set status='cancelled',responded_at=coalesce(responded_at,now())
    where job_id=job_row.id and id<>offer_row.id and status='offered';

    update public.jobs
    set status='accepted',matched_provider_id=p_provider_id,updated_at=now()
    where id=job_row.id;

    insert into public.audit_events(event_type,entity_type,entity_id,metadata)
    values('job_offer_accepted','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'offer_id',p_offer_id));

    return jsonb_build_object('jobId',job_row.id,'status','accepted');
  elsif p_action='decline' then
    if offer_row.status<>'offered' then raise exception 'offer_not_available'; end if;

    update public.job_offers
    set status='declined',responded_at=now()
    where id=offer_row.id;

    update public.jobs
    set status='new',updated_at=now()
    where id=job_row.id and status='offered';

    insert into public.audit_events(event_type,entity_type,entity_id,metadata)
    values('job_offer_declined','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'offer_id',p_offer_id));

    return jsonb_build_object('jobId',job_row.id,'status','new');
  elsif p_action='complete' then
    if offer_row.status<>'accepted' or job_row.matched_provider_id<>p_provider_id then
      raise exception 'job_not_owned_by_provider';
    end if;
    if job_row.status not in ('accepted','scheduled','in_progress') then
      raise exception 'job_not_completable';
    end if;

    update public.jobs set status='completed',updated_at=now() where id=job_row.id;

    update public.providers
    set completion_rate=least(1,completion_rate+0.005),quality_score=least(100,quality_score+0.25),updated_at=now()
    where id=p_provider_id;

    insert into public.audit_events(event_type,entity_type,entity_id,metadata)
    values('job_completed','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id));

    return jsonb_build_object('jobId',job_row.id,'status','completed');
  else
    raise exception 'invalid_offer_action';
  end if;
end;
$$;

revoke all on function public.respond_to_job_offer(uuid,uuid,text) from public,anon;
grant execute on function public.respond_to_job_offer(uuid,uuid,text) to authenticated,service_role;

create or replace function public.expire_stale_job_offers()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  expired_count integer;
begin
  with expired as (
    update public.job_offers
    set status='expired'
    where status='offered' and expires_at is not null and expires_at<=now()
    returning job_id
  ), reset_jobs as (
    update public.jobs j
    set status='new',updated_at=now()
    where j.status='offered'
      and exists(select 1 from expired e where e.job_id=j.id)
      and not exists(select 1 from public.job_offers jo where jo.job_id=j.id and jo.status='offered')
    returning j.id
  )
  select count(*) into expired_count from expired;
  return expired_count;
end;
$$;

revoke all on function public.expire_stale_job_offers() from public,anon,authenticated;
grant execute on function public.expire_stale_job_offers() to service_role;
