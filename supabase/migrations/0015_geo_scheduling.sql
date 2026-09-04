-- Production geolocation and scheduling controls.

alter table public.engineer_availability_rules
  add column if not exists buffer_before_minutes integer not null default 15 check (buffer_before_minutes between 0 and 240),
  add column if not exists buffer_after_minutes integer not null default 15 check (buffer_after_minutes between 0 and 240),
  add column if not exists maximum_jobs_per_day integer check (maximum_jobs_per_day is null or maximum_jobs_per_day between 1 and 50),
  add column if not exists allowed_service_keys text[] not null default '{}';

alter table public.jobs
  add column if not exists route_distance_meters integer check (route_distance_meters is null or route_distance_meters >= 0),
  add column if not exists route_duration_seconds integer check (route_duration_seconds is null or route_duration_seconds >= 0),
  add column if not exists route_source text,
  add column if not exists route_calculated_at timestamptz,
  add column if not exists arrival_tolerance_minutes integer not null default 15 check (arrival_tolerance_minutes between 0 and 240),
  add column if not exists estimated_arrival_at timestamptz,
  add column if not exists actual_arrival_at timestamptz,
  add column if not exists completion_submitted_at timestamptz,
  add column if not exists customer_confirmed_at timestamptz;

create table public.engineer_location_sessions (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  started_by uuid references public.profiles(id) on delete set null,
  consented_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','ended','expired')),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index engineer_location_sessions_active_idx on public.engineer_location_sessions(engineer_id,status) where status='active';

-- One latest location per engineer. We deliberately do not retain route history by default.
create table public.engineer_live_locations (
  engineer_id uuid primary key references public.engineers(id) on delete cascade,
  session_id uuid not null references public.engineer_location_sessions(id) on delete cascade,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(10,2) check (accuracy_meters is null or accuracy_meters >= 0),
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (expires_at > captured_at)
);
create index engineer_live_locations_fresh_idx on public.engineer_live_locations(expires_at);

create table public.routing_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  engineer_id uuid references public.engineers(id) on delete set null,
  origin_kind text not null check (origin_kind in ('live','business_base','declared')),
  distance_meters integer not null check (distance_meters >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  source text not null,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(job_id,provider_id,engineer_id,calculated_at)
);
create index routing_snapshots_lookup_idx on public.routing_snapshots(job_id,provider_id,calculated_at desc);

create table public.provider_travel_bands (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  service_key text,
  minimum_distance_meters integer not null default 0 check (minimum_distance_meters >= 0),
  maximum_distance_meters integer check (maximum_distance_meters is null or maximum_distance_meters > minimum_distance_meters),
  charge_pence integer not null default 0 check (charge_pence >= 0),
  reject_beyond_band boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index provider_travel_bands_org_idx on public.provider_travel_bands(organisation_id,service_key,minimum_distance_meters);

alter table public.engineer_location_sessions enable row level security;
alter table public.engineer_live_locations enable row level security;
alter table public.routing_snapshots enable row level security;
alter table public.provider_travel_bands enable row level security;

create policy "engineer sees own location sessions" on public.engineer_location_sessions for select using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
  or exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','dispatcher'))
);
create policy "engineer sees own live location" on public.engineer_live_locations for select using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
  or exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','dispatcher'))
);
create policy "provider members see travel bands" on public.provider_travel_bands for select using (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid())
);
create policy "provider managers manage travel bands" on public.provider_travel_bands for all using (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
) with check (
  exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))
);

-- Routing snapshots are dispatch-internal and intentionally have no client RLS policy.
revoke all on public.routing_snapshots from anon,authenticated;

grant select on public.engineer_location_sessions,public.engineer_live_locations,public.provider_travel_bands to authenticated;
