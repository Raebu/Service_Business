-- Critical foundation: individual engineers, transparent pricing, scheduling, geolocation and finance ledger.

create table public.engineers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  email text,
  phone text,
  employment_role text not null default 'engineer' check (employment_role in ('owner','engineer','dispatcher','apprentice','trainee')),
  status text not null default 'active' check (status in ('invited','active','inactive','suspended')),
  can_work_unsupervised boolean not null default false,
  available_now boolean not null default false,
  live_latitude numeric(9,6),
  live_longitude numeric(9,6),
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,user_id),
  check (live_latitude is null or live_latitude between -90 and 90),
  check (live_longitude is null or live_longitude between -180 and 180)
);

create index engineers_org_status_idx on public.engineers(organisation_id,status);
create index engineers_available_idx on public.engineers(available_now) where status='active';

create table public.engineer_competencies (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  service_key text not null,
  competency_level text not null default 'supervised' check (competency_level in ('observer','supervised','competent','advanced')),
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  evidence_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(engineer_id,service_key)
);

create index engineer_competencies_lookup_idx on public.engineer_competencies(service_key,verified,competency_level);

create table public.engineer_availability_rules (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Europe/London',
  auto_accept boolean not null default false,
  minimum_job_pence integer not null default 0 check (minimum_job_pence >= 0),
  maximum_duration_minutes integer check (maximum_duration_minutes is null or maximum_duration_minutes > 0),
  maximum_travel_minutes integer check (maximum_travel_minutes is null or maximum_travel_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.engineer_time_off (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.provider_rate_cards (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null default 'Standard',
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create unique index provider_rate_cards_active_name_idx
  on public.provider_rate_cards(organisation_id,name,version);

create table public.provider_rate_items (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references public.provider_rate_cards(id) on delete cascade,
  service_key text not null,
  pricing_mode text not null check (pricing_mode in ('fixed','hourly','diagnostic')),
  fixed_price_pence integer check (fixed_price_pence is null or fixed_price_pence >= 0),
  callout_pence integer not null default 0 check (callout_pence >= 0),
  hourly_pence integer check (hourly_pence is null or hourly_pence >= 0),
  minimum_charge_pence integer not null default 0 check (minimum_charge_pence >= 0),
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  emergency_multiplier numeric(6,3) not null default 1 check (emergency_multiplier >= 1),
  travel_rules jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(rate_card_id,service_key)
);

create table public.platform_pricing_policies (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  name text not null,
  customer_fee_bps integer not null check (customer_fee_bps between 0 and 10000),
  minimum_fee_pence integer check (minimum_fee_pence is null or minimum_fee_pence >= 0),
  maximum_fee_pence integer check (maximum_fee_pence is null or maximum_fee_pence >= 0),
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  check (maximum_fee_pence is null or minimum_fee_pence is null or maximum_fee_pence >= minimum_fee_pence),
  check (effective_to is null or effective_to > effective_from)
);

create unique index platform_pricing_active_idx on public.platform_pricing_policies(vertical_id) where active;
insert into public.platform_pricing_policies(vertical_id,name,customer_fee_bps)
values('electrical','Transparent standard customer service fee',1500)
on conflict do nothing;

alter table public.organisations
  add column if not exists base_latitude numeric(9,6),
  add column if not exists base_longitude numeric(9,6),
  add column if not exists default_service_radius_km numeric(8,2),
  add constraint organisations_base_latitude_check check (base_latitude is null or base_latitude between -90 and 90),
  add constraint organisations_base_longitude_check check (base_longitude is null or base_longitude between -180 and 180),
  add constraint organisations_service_radius_check check (default_service_radius_km is null or default_service_radius_km > 0);

alter table public.properties
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add constraint properties_latitude_check check (latitude is null or latitude between -90 and 90),
  add constraint properties_longitude_check check (longitude is null or longitude between -180 and 180);

alter table public.jobs
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists schedule_mode text not null default 'asap' check (schedule_mode in ('asap','exact','window','flexible')),
  add column if not exists requested_start timestamptz,
  add column if not exists requested_end timestamptz,
  add column if not exists estimated_duration_minutes integer,
  add column if not exists assigned_engineer_id uuid references public.engineers(id) on delete set null,
  add column if not exists provider_price_pence integer,
  add column if not exists platform_fee_pence integer,
  add column if not exists customer_total_pence integer,
  add column if not exists currency text not null default 'GBP',
  add column if not exists quote_version integer,
  add column if not exists quote_locked_at timestamptz,
  add constraint jobs_latitude_check check (latitude is null or latitude between -90 and 90),
  add constraint jobs_longitude_check check (longitude is null or longitude between -180 and 180),
  add constraint jobs_duration_check check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  add constraint jobs_schedule_range_check check (requested_end is null or requested_start is null or requested_end > requested_start),
  add constraint jobs_provider_price_check check (provider_price_pence is null or provider_price_pence >= 0),
  add constraint jobs_platform_fee_check check (platform_fee_pence is null or platform_fee_pence >= 0),
  add constraint jobs_total_check check (customer_total_pence is null or customer_total_pence >= 0);

create index jobs_assigned_engineer_idx on public.jobs(assigned_engineer_id,status) where assigned_engineer_id is not null;
create index jobs_requested_start_idx on public.jobs(requested_start) where requested_start is not null;

create table public.finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  source_type text not null,
  source_id text not null,
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'posted' check (status in ('posted','reversed')),
  posted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.finance_journal_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.finance_journal_entries(id) on delete restrict,
  account_code text not null,
  direction text not null check (direction in ('debit','credit')),
  amount_pence bigint not null check (amount_pence > 0),
  job_id uuid references public.jobs(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  provider_id uuid references public.providers(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index finance_lines_job_idx on public.finance_journal_lines(job_id);
create index finance_lines_org_idx on public.finance_journal_lines(organisation_id);

create or replace function public.post_finance_journal(
  p_idempotency_key text,
  p_source_type text,
  p_source_id text,
  p_currency text,
  p_lines jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer set search_path=public
as $$
declare
  entry_id uuid;
  debit_total bigint;
  credit_total bigint;
begin
  select id into entry_id from public.finance_journal_entries where idempotency_key=p_idempotency_key;
  if entry_id is not null then return entry_id; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception 'journal_requires_lines'; end if;

  select coalesce(sum((x->>'amountPence')::bigint) filter (where x->>'direction'='debit'),0),
         coalesce(sum((x->>'amountPence')::bigint) filter (where x->>'direction'='credit'),0)
    into debit_total,credit_total
  from jsonb_array_elements(p_lines) x;
  if debit_total<=0 or debit_total<>credit_total then raise exception 'journal_not_balanced'; end if;

  insert into public.finance_journal_entries(idempotency_key,source_type,source_id,currency,metadata)
  values(p_idempotency_key,p_source_type,p_source_id,upper(p_currency),coalesce(p_metadata,'{}'::jsonb))
  returning id into entry_id;

  insert into public.finance_journal_lines(entry_id,account_code,direction,amount_pence,job_id,organisation_id,provider_id,metadata)
  select entry_id,
         x->>'accountCode',
         x->>'direction',
         (x->>'amountPence')::bigint,
         nullif(x->>'jobId','')::uuid,
         nullif(x->>'organisationId','')::uuid,
         nullif(x->>'providerId','')::uuid,
         coalesce(x->'metadata','{}'::jsonb)
  from jsonb_array_elements(p_lines) x;

  return entry_id;
end;
$$;

revoke all on function public.post_finance_journal(text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.post_finance_journal(text,text,text,text,jsonb,jsonb) to service_role;

-- Defence in depth: authenticated users cannot spoof another provider when calling the offer RPC directly.
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
    update public.jobs set status='accepted',matched_provider_id=p_provider_id,updated_at=now() where id=job_row.id;
    insert into public.audit_events(event_type,entity_type,entity_id,metadata) values('job_offer_accepted','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'offer_id',p_offer_id));
    return jsonb_build_object('jobId',job_row.id,'status','accepted');
  elsif p_action='decline' then
    if offer_row.status<>'offered' then raise exception 'offer_not_available'; end if;
    update public.job_offers set status='declined',responded_at=now() where id=offer_row.id;
    update public.jobs set status='new',updated_at=now() where id=job_row.id and status='offered';
    insert into public.audit_events(event_type,entity_type,entity_id,metadata) values('job_offer_declined','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id,'offer_id',p_offer_id));
    return jsonb_build_object('jobId',job_row.id,'status','new');
  elsif p_action='complete' then
    if offer_row.status<>'accepted' or job_row.matched_provider_id<>p_provider_id then raise exception 'job_not_owned_by_provider'; end if;
    if job_row.status not in ('accepted','scheduled','in_progress') then raise exception 'job_not_completable'; end if;
    update public.jobs set status='completed',updated_at=now() where id=job_row.id;
    update public.providers set completion_rate=least(1,completion_rate+0.005),quality_score=least(100,quality_score+0.25),updated_at=now() where id=p_provider_id;
    insert into public.audit_events(event_type,entity_type,entity_id,metadata) values('job_completed','job',job_row.id::text,jsonb_build_object('provider_id',p_provider_id));
    return jsonb_build_object('jobId',job_row.id,'status','completed');
  else
    raise exception 'invalid_offer_action';
  end if;
end;
$$;

revoke all on function public.respond_to_job_offer(uuid,uuid,text) from public,anon;
grant execute on function public.respond_to_job_offer(uuid,uuid,text) to authenticated,service_role;

alter table public.engineers enable row level security;
alter table public.engineer_competencies enable row level security;
alter table public.engineer_availability_rules enable row level security;
alter table public.engineer_time_off enable row level security;
alter table public.provider_rate_cards enable row level security;
alter table public.provider_rate_items enable row level security;
alter table public.platform_pricing_policies enable row level security;
alter table public.finance_journal_entries enable row level security;
alter table public.finance_journal_lines enable row level security;

create policy "members see engineers" on public.engineers for select using (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid())
);
create policy "engineers update self" on public.engineers for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "managers manage engineers" on public.engineers for all using (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','dispatcher'))
) with check (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','dispatcher'))
);

create policy "members see competencies" on public.engineer_competencies for select using (
  exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid())
);
create policy "managers manage competencies" on public.engineer_competencies for all using (
  exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
) with check (
  exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
);

create policy "members see availability" on public.engineer_availability_rules for select using (
  exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid())
);
create policy "engineer manages own availability" on public.engineer_availability_rules for all using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
) with check (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
);
create policy "members see time off" on public.engineer_time_off for select using (
  exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid())
);
create policy "engineer manages own time off" on public.engineer_time_off for all using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
) with check (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
);

create policy "provider members see rate cards" on public.provider_rate_cards for select using (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid())
);
create policy "provider managers manage rate cards" on public.provider_rate_cards for all using (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
) with check (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
);
create policy "provider members see rate items" on public.provider_rate_items for select using (
  exists(select 1 from public.provider_rate_cards rc join public.organisation_members m on m.organisation_id=rc.organisation_id where rc.id=rate_card_id and m.user_id=auth.uid())
);
create policy "provider managers manage rate items" on public.provider_rate_items for all using (
  exists(select 1 from public.provider_rate_cards rc join public.organisation_members m on m.organisation_id=rc.organisation_id where rc.id=rate_card_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
) with check (
  exists(select 1 from public.provider_rate_cards rc join public.organisation_members m on m.organisation_id=rc.organisation_id where rc.id=rate_card_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
);

revoke all on public.platform_pricing_policies from anon,authenticated;
revoke all on public.finance_journal_entries from anon,authenticated;
revoke all on public.finance_journal_lines from anon,authenticated;
