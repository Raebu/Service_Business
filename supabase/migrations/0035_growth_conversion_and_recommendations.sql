-- Growth opportunities, drafts and meeting requests; none are published, booked or sent automatically.
create table if not exists public.growth_meeting_requests (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.growth_outreach_queue(id) on delete set null,
  workstream text not null check(workstream in ('provider_recruitment','corporate_acquisition','academy_employer')),
  contact_name text not null,
  email text not null,
  purpose text not null,
  status text not null default 'needs_review' check(status in ('needs_review','approved','invited','booked','cancelled')),
  proposed_start timestamptz,
  calendar_event_id text,
  created_at timestamptz not null default now()
);
create index if not exists growth_meetings_status_idx on public.growth_meeting_requests(status,created_at);

create table if not exists public.growth_content_drafts (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null default 'electrical',
  area text not null,
  service_key text not null,
  period_start date not null,
  headline text not null,
  brief text not null,
  demand_count integer not null,
  verified_provider_count integer not null,
  status text not null default 'review' check(status in ('review','approved','rejected','published')),
  published_url text,
  created_at timestamptz not null default now(),
  unique(vertical_id,area,service_key,period_start)
);
create table if not exists public.growth_conversion_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.growth_outreach_queue(id) on delete set null,
  source_type text not null,
  source_id uuid,
  event_type text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists growth_conversion_events_source_idx on public.growth_conversion_events(source_type,source_id,created_at desc);

create table if not exists public.growth_action_recommendations (
  id uuid primary key default gen_random_uuid(),
  source_reference text not null unique,
  category text not null check(category in ('supply','conversion','content','operations','compliance')),
  priority integer not null check(priority between 1 and 100),
  explanation text not null,
  status text not null default 'review' check(status in ('review','approved','dismissed','actioned')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists growth_outreach_source_identity_idx
  on public.growth_outreach_queue(workstream,source_reference)
  where source_reference is not null;

alter table public.growth_meeting_requests enable row level security;
alter table public.growth_content_drafts enable row level security;
alter table public.growth_conversion_events enable row level security;
alter table public.growth_action_recommendations enable row level security;
revoke all on public.growth_meeting_requests,public.growth_content_drafts,
 public.growth_conversion_events,public.growth_action_recommendations from anon,authenticated;
