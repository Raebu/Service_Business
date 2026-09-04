-- Expands the service-business control plane across RBAC, pricing, recovery,
-- corporate SLAs, finance, scheduling and autonomous growth. All new tables are
-- service-side by default; client access is mediated by authenticated APIs.

create table if not exists public.role_capabilities (
  role text not null,
  capability text not null,
  allowed boolean not null default true,
  primary key (role, capability)
);

insert into public.role_capabilities(role,capability,allowed) values
 ('owner','manage_team',true),('owner','manage_pricing',true),('owner','manage_payouts',true),('owner','manage_finance',true),('owner','dispatch_jobs',true),
 ('admin','manage_team',true),('admin','manage_pricing',true),('admin','manage_finance',true),('admin','dispatch_jobs',true),
 ('dispatcher','dispatch_jobs',true),('dispatcher','view_team_schedule',true),
 ('engineer','view_own_jobs',true),('engineer','update_own_job_progress',true),('engineer','share_live_location',true),
 ('apprentice','view_own_jobs',true),('apprentice','update_own_job_progress',true),('apprentice','share_live_location',true)
on conflict (role,capability) do update set allowed=excluded.allowed;

create table if not exists public.job_scope_assessments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  lane text not null check (lane in ('fixed','estimate_range','diagnostic_visit','manual_exception')),
  confidence numeric(5,4) not null default 0,
  estimated_low_pence integer,
  estimated_high_pence integer,
  diagnostic_price_pence integer,
  service_key text,
  evidence jsonb not null default '{}'::jsonb,
  assumptions text[] not null default '{}',
  requires_customer_approval boolean not null default false,
  model_version text,
  created_at timestamptz not null default now(),
  unique(job_id)
);

create table if not exists public.follow_on_quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  engineer_id uuid references public.engineers(id) on delete set null,
  description text not null,
  provider_price_pence integer not null check (provider_price_pence >= 0),
  platform_fee_pence integer not null default 0 check (platform_fee_pence >= 0),
  customer_total_pence integer not null check (customer_total_pence >= 0),
  status text not null default 'proposed' check (status in ('proposed','approved','declined','expired','superseded')),
  expires_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_reserve_policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  reserve_bps integer not null default 0 check (reserve_bps between 0 and 10000),
  maximum_reserve_pence integer,
  release_after_days integer not null default 7 check (release_after_days between 0 and 365),
  applies_to_new_provider_days integer not null default 0,
  minimum_job_pence integer not null default 0,
  reason text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_reserve_holds (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  policy_id uuid references public.provider_reserve_policies(id) on delete set null,
  amount_pence integer not null check (amount_pence >= 0),
  status text not null default 'held' check (status in ('held','released','applied','cancelled')),
  reason text not null,
  release_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique(job_id, provider_id, policy_id)
);

create table if not exists public.corporate_slas (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  priority text not null default 'standard',
  response_target_minutes integer,
  attendance_target_minutes integer,
  resolution_target_minutes integer,
  management_fee_pence integer not null default 0,
  monthly_fee_pence integer not null default 0,
  service_keys text[] not null default '{}',
  coverage_areas text[] not null default '{}',
  escalation_policy jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

alter table public.jobs add column if not exists corporate_sla_id uuid references public.corporate_slas(id) on delete set null;
alter table public.jobs add column if not exists po_reference text;
alter table public.jobs add column if not exists cost_centre text;
alter table public.jobs add column if not exists site_reference text;
alter table public.jobs add column if not exists arrived_at timestamptz;
alter table public.jobs add column if not exists work_started_at timestamptz;
alter table public.jobs add column if not exists completed_at timestamptz;
alter table public.jobs add column if not exists last_progress_at timestamptz;
alter table public.jobs add column if not exists operational_risk_state text not null default 'normal';

create table if not exists public.corporate_billing_profiles (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('per_job','weekly','monthly')),
  payment_terms_days integer not null default 30,
  purchase_order_required boolean not null default false,
  consolidated_billing boolean not null default true,
  stripe_customer_id text,
  billing_email text,
  invoice_metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.corporate_invoice_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','ready','issued','paid','exception','cancelled')),
  subtotal_pence bigint not null default 0,
  management_fee_pence bigint not null default 0,
  vat_pence bigint not null default 0,
  total_pence bigint not null default 0,
  stripe_invoice_id text,
  exception_reason text,
  created_at timestamptz not null default now(),
  unique(organisation_id,period_start,period_end)
);

create table if not exists public.job_progress_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  engineer_id uuid references public.engineers(id) on delete set null,
  event_type text not null check (event_type in ('en_route','arrived','started','paused','resumed','completed','delay_reported','no_show_detected','overrun_detected','reassigned')),
  occurred_at timestamptz not null default now(),
  latitude numeric(9,6),
  longitude numeric(9,6),
  note text,
  source text not null default 'platform',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists job_progress_events_job_time_idx on public.job_progress_events(job_id,occurred_at desc);

create table if not exists public.recovery_signals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  signal_type text not null check (signal_type in ('no_show','late_arrival','overrun','customer_unreachable','provider_unreachable','route_risk','sla_breach')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  detected_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','actioned','dismissed','exception')),
  action_taken text,
  unique(job_id,signal_type,status)
);

create table if not exists public.coverage_gap_signals (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  service_key text not null,
  window_days integer not null default 30,
  demand_count integer not null default 0,
  verified_provider_count integer not null default 0,
  fill_rate numeric(6,5),
  median_match_minutes numeric(10,2),
  gap_score numeric(8,3) not null default 0,
  status text not null default 'open' check (status in ('open','recruiting','healthy','paused')),
  calculated_at timestamptz not null default now(),
  unique(area,service_key,window_days)
);

create table if not exists public.growth_outreach_queue (
  id uuid primary key default gen_random_uuid(),
  workstream text not null check (workstream in ('provider_recruitment','corporate_acquisition','academy_employer')),
  area text,
  service_key text,
  organisation_name text,
  domain text,
  contact_name text,
  contact_role text,
  direct_email text,
  email_verified boolean not null default false,
  generic_email_rejected boolean not null default false,
  source_reference text,
  score numeric(8,3) not null default 0,
  status text not null default 'discovered' check (status in ('discovered','verified','ready','contacted','replied','qualified','rejected','paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (direct_email is null or lower(direct_email) !~ '^(info|hello|contact|enquiries|enquiry|support|sales|office|admin)@')
);

create index if not exists growth_outreach_queue_ready_idx on public.growth_outreach_queue(workstream,status,score desc);

create table if not exists public.schedule_optimisation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  service_date date not null,
  status text not null default 'planned' check (status in ('planned','optimised','applied','exception')),
  objective jsonb not null default '{"travel":0.35,"punctuality":0.30,"utilisation":0.20,"preferences":0.15}'::jsonb,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_plan jsonb not null default '{}'::jsonb,
  improvement_score numeric(8,3),
  created_at timestamptz not null default now()
);

create table if not exists public.review_risk_signals (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  signal_type text not null,
  score numeric(5,4) not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(review_id,signal_type)
);

alter table public.role_capabilities enable row level security;
alter table public.job_scope_assessments enable row level security;
alter table public.follow_on_quotes enable row level security;
alter table public.provider_reserve_policies enable row level security;
alter table public.provider_reserve_holds enable row level security;
alter table public.corporate_slas enable row level security;
alter table public.corporate_billing_profiles enable row level security;
alter table public.corporate_invoice_runs enable row level security;
alter table public.job_progress_events enable row level security;
alter table public.recovery_signals enable row level security;
alter table public.coverage_gap_signals enable row level security;
alter table public.growth_outreach_queue enable row level security;
alter table public.schedule_optimisation_runs enable row level security;
alter table public.review_risk_signals enable row level security;
