-- Delivery controls that turn several previously conceptual workflows into durable, auditable product state.

create table if not exists public.business_setup_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.business_setup_cases(id) on delete cascade,
  step_key text not null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','waiting_approval','completed','blocked','not_applicable')),
  completed_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now(),
  unique(case_id,step_key)
);

create table if not exists public.pricing_benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  checked_on date not null default current_date,
  source_name text not null,
  source_url text,
  pricing_model text not null,
  effective_take_bps integer check (effective_take_bps is null or effective_take_bps between 0 and 10000),
  assumptions jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(vertical_id,checked_on,source_name,pricing_model)
);

create table if not exists public.provider_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.engineers(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft','ical')),
  external_calendar_id text,
  credential_reference text,
  sync_direction text not null default 'read_busy' check (sync_direction in ('read_busy','two_way')),
  status text not null default 'pending' check (status in ('pending','active','paused','error','revoked')),
  last_synced_at timestamptz,
  sync_cursor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(engineer_id,provider,external_calendar_id)
);

create table if not exists public.external_calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.provider_calendar_connections(id) on delete cascade,
  external_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  etag text,
  updated_at timestamptz not null default now(),
  unique(connection_id,external_event_id),
  check (ends_at > starts_at)
);

create table if not exists public.operational_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null default 'electrical',
  window_days integer not null default 30 check (window_days between 1 and 365),
  measured_at timestamptz not null default now(),
  total_jobs integer not null default 0,
  straight_through_jobs integer not null default 0,
  exception_jobs integer not null default 0,
  straight_through_rate numeric(7,6),
  median_match_seconds numeric(12,2),
  fill_rate numeric(7,6),
  no_show_rate numeric(7,6),
  recovery_rate numeric(7,6),
  evidence jsonb not null default '{}'::jsonb
);

create table if not exists public.labour_demand_snapshots (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  service_key text not null,
  measured_on date not null default current_date,
  demand_count integer not null default 0,
  verified_provider_count integer not null default 0,
  open_training_opportunities integer not null default 0,
  shortage_score numeric(8,3) not null default 0,
  trend text not null default 'stable' check (trend in ('rising','stable','falling')),
  source_window_days integer not null default 30,
  unique(area,service_key,measured_on)
);

create table if not exists public.provider_quality_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  measured_at timestamptz not null default now(),
  completion_rate numeric(7,6) not null default 0,
  acceptance_rate numeric(7,6) not null default 0,
  review_score numeric(6,3),
  rework_rate numeric(7,6) not null default 0,
  no_show_rate numeric(7,6) not null default 0,
  composite_score numeric(8,3) not null default 0,
  explanation jsonb not null default '{}'::jsonb
);

alter table public.business_setup_steps enable row level security;
alter table public.pricing_benchmark_snapshots enable row level security;
alter table public.provider_calendar_connections enable row level security;
alter table public.external_calendar_busy_blocks enable row level security;
alter table public.operational_kpi_snapshots enable row level security;
alter table public.labour_demand_snapshots enable row level security;
alter table public.provider_quality_snapshots enable row level security;

create policy "user reads own business setup steps" on public.business_setup_steps for select using (
  exists(select 1 from public.business_setup_cases c where c.id=case_id and c.user_id=auth.uid())
);
create policy "engineer reads own calendar connections" on public.provider_calendar_connections for select using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
  or exists(select 1 from public.engineers e join public.organisation_members m on m.organisation_id=e.organisation_id where e.id=engineer_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','dispatcher'))
);
create policy "engineer manages own calendar connections" on public.provider_calendar_connections for all using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
) with check (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
);
create policy "members read busy blocks" on public.external_calendar_busy_blocks for select using (
  exists(select 1 from public.provider_calendar_connections c join public.engineers e on e.id=c.engineer_id join public.organisation_members m on m.organisation_id=e.organisation_id where c.id=connection_id and m.user_id=auth.uid())
);

revoke all on public.pricing_benchmark_snapshots,public.operational_kpi_snapshots,public.labour_demand_snapshots,public.provider_quality_snapshots from anon,authenticated;
