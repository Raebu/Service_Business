-- Bind offers to individual engineers and preserve the exact transparent quote offered.

alter table public.job_offers
  add column if not exists engineer_id uuid references public.engineers(id) on delete set null,
  add column if not exists provider_price_pence integer,
  add column if not exists platform_fee_pence integer,
  add column if not exists customer_total_pence integer,
  add column if not exists currency text not null default 'GBP',
  add column if not exists offer_wave smallint not null default 1,
  add constraint job_offers_provider_price_check check (provider_price_pence is null or provider_price_pence >= 0),
  add constraint job_offers_platform_fee_check check (platform_fee_pence is null or platform_fee_pence >= 0),
  add constraint job_offers_total_check check (customer_total_pence is null or customer_total_pence >= 0),
  add constraint job_offers_wave_check check (offer_wave > 0);

alter table public.jobs
  add column if not exists quoted_provider_id uuid references public.providers(id) on delete set null,
  add column if not exists quoted_engineer_id uuid references public.engineers(id) on delete set null,
  add column if not exists dispatch_started_at timestamptz,
  add column if not exists last_offer_at timestamptz;

create index if not exists job_offers_engineer_idx on public.job_offers(engineer_id,status) where engineer_id is not null;
create index if not exists jobs_dispatch_state_idx on public.jobs(status,last_offer_at);

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
  engineer_row public.engineers%rowtype;
begin
  if auth.uid() is not null and not exists(
    select 1 from public.providers p
    join public.organisation_members m on m.organisation_id=p.organisation_id
    where p.id=p_provider_id and m.user_id=auth.uid()
  ) then
    raise exception 'provider_membership_required';
  end if;

  select * into offer_row from public.job_offers where id=p_offer_id and provider_id=p_provider_id for update;
  if offer_row.id is null then raise exception 'offer_not_found'; end if;
  select * into job_row from public.jobs where id=offer_row.job_id for update;
  if job_row.id is null then raise exception 'job_not_found'; end if;

  if offer_row.engineer_id is not null then
    select * into engineer_row from public.engineers where id=offer_row.engineer_id;
    if engineer_row.id is null or engineer_row.status<>'active' then raise exception 'engineer_not_available'; end if;
    if not engineer_row.can_work_unsupervised then raise exception 'engineer_requires_supervision'; end if;
    if not exists(
      select 1 from public.providers p
      where p.id=p_provider_id and p.organisation_id=engineer_row.organisation_id
    ) then raise exception 'engineer_provider_mismatch'; end if;
  end if;

  if p_action='accept' then
    if offer_row.status<>'offered' then raise exception 'offer_not_available'; end if;
    if offer_row.expires_at is not null and offer_row.expires_at<=now() then
      update public.job_offers set status='expired',responded_at=now() where id=offer_row.id;
      update public.jobs set status='new',updated_at=now() where id=job_row.id and status='offered';
      raise exception 'offer_expired';
    end if;
    if job_row.status not in ('new','offered') then raise exception 'job_not_available'; end if;

    update public.job_offers set status='accepted',responded_at=now() where id=offer_row.id;
    update public.job_offers set status='cancelled',responded_at=coalesce(responded_at,now()) where job_id=job_row.id and id<>offer_row.id and status='offered';

    update public.jobs
    set status='accepted',
        matched_provider_id=p_provider_id,
        assigned_engineer_id=offer_row.engineer_id,
        provider_price_pence=coalesce(offer_row.provider_price_pence,provider_price_pence),
        platform_fee_pence=coalesce(offer_row.platform_fee_pence,platform_fee_pence),
        customer_total_pence=coalesce(offer_row.customer_total_pence,customer_total_pence),
        quoted_provider_id=p_provider_id,
        quoted_engineer_id=offer_row.engineer_id,
        quote_locked_at=coalesce(quote_locked_at,now()),
        updated_at=now()
    where id=job_row.id;

    insert into public.audit_events(event_type,entity_type,entity_id,metadata)
    values('job_offer_accepted','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'engineer_id',offer_row.engineer_id,'offer_id',p_offer_id,'provider_price_pence',offer_row.provider_price_pence,'platform_fee_pence',offer_row.platform_fee_pence));

    return jsonb_build_object('jobId',job_row.id,'status','accepted','engineerId',offer_row.engineer_id);
  elsif p_action='decline' then
    if offer_row.status<>'offered' then raise exception 'offer_not_available'; end if;
    update public.job_offers set status='declined',responded_at=now() where id=offer_row.id;
    if not exists(select 1 from public.job_offers jo where jo.job_id=job_row.id and jo.id<>offer_row.id and jo.status='offered' and (jo.expires_at is null or jo.expires_at>now())) then
      update public.jobs set status='new',updated_at=now() where id=job_row.id and status='offered';
    end if;
    insert into public.audit_events(event_type,entity_type,entity_id,metadata)
    values('job_offer_declined','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'engineer_id',offer_row.engineer_id,'offer_id',p_offer_id));
    return jsonb_build_object('jobId',job_row.id,'status','redispatch_pending');
  elsif p_action='complete' then
    if offer_row.status<>'accepted' or job_row.matched_provider_id<>p_provider_id then raise exception 'job_not_owned_by_provider'; end if;
    if job_row.status not in ('accepted','scheduled','in_progress') then raise exception 'job_not_completable'; end if;
    update public.jobs set status='completed',updated_at=now() where id=job_row.id;
    update public.providers set completion_rate=least(1,completion_rate+0.005),quality_score=least(100,quality_score+0.25),updated_at=now() where id=p_provider_id;
    insert into public.audit_events(event_type,entity_type,entity_id,metadata)
    values('job_completed','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'engineer_id',job_row.assigned_engineer_id));
    return jsonb_build_object('jobId',job_row.id,'status','completed');
  else
    raise exception 'invalid_offer_action';
  end if;
end;
$$;

revoke all on function public.respond_to_job_offer(uuid,uuid,text) from public,anon;
grant execute on function public.respond_to_job_offer(uuid,uuid,text) to authenticated,service_role;
