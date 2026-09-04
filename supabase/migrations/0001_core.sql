create extension if not exists pgcrypto;

create type public.actor_role as enum ('customer','provider','business','education','admin');
create type public.provider_application_status as enum ('draft','submitted','screening','evidence_required','verified','rejected','suspended');
create type public.verification_status as enum ('pending','verified','rejected','expired');
create type public.coverage_status as enum ('closed','recruiting','ready','live');
create type public.job_status as enum ('coverage_waitlist','safety_escalation','new','offered','accepted','scheduled','in_progress','completed','cancelled','disputed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  default_role public.actor_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  kind text not null check (kind in ('provider_business','business_client','education_provider')),
  name text not null,
  company_number text,
  website text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organisation_id,user_id)
);

create table public.provider_applications (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  website text,
  company_number text,
  coverage_areas text[] not null default '{}',
  services text[] not null default '{}',
  scheme_details text,
  insurance_expiry date,
  can_take_apprentice boolean not null default false,
  status public.provider_application_status not null default 'submitted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index provider_applications_vertical_status_idx on public.provider_applications(vertical_id,status);
create index provider_applications_email_idx on public.provider_applications(lower(email));

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations(id) on delete cascade,
  application_id uuid references public.provider_applications(id) on delete set null,
  public_slug text not null unique,
  verification_state text not null default 'pending' check (verification_state in ('pending','active','suspended','expired','revoked')),
  verified_at timestamptz,
  quality_score numeric(5,2) not null default 80,
  acceptance_rate numeric(5,4) not null default 1,
  completion_rate numeric(5,4) not null default 1,
  rework_rate numeric(5,4) not null default 0,
  available_now boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_evidence (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  kind text not null check (kind in ('business_identity','qualification','scheme_membership','insurance','other')),
  label text not null,
  reference text,
  storage_path text,
  status public.verification_status not null default 'pending',
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index provider_evidence_provider_idx on public.provider_evidence(provider_id);
create index provider_evidence_expiry_idx on public.provider_evidence(expires_at) where expires_at is not null;

create table public.provider_services (
  provider_id uuid not null references public.providers(id) on delete cascade,
  service_key text not null,
  active boolean not null default true,
  primary key(provider_id,service_key)
);

create table public.provider_coverage (
  provider_id uuid not null references public.providers(id) on delete cascade,
  area text not null,
  active boolean not null default true,
  priority smallint not null default 100,
  primary key(provider_id,area)
);

create table public.service_areas (
  vertical_id text not null,
  area text not null,
  status public.coverage_status not null default 'closed',
  verified_providers integer not null default 0,
  fill_rate numeric(5,4) not null default 0,
  median_match_minutes numeric(8,2) not null default 0,
  demand_30d integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(vertical_id,area)
);

create table public.business_enquiries (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  organisation text not null,
  contact_name text not null,
  email text not null,
  phone text,
  segment text not null,
  sites integer not null check (sites > 0),
  requirements text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table public.academy_interest (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  audience text not null check (audience in ('education_provider','learner','employer')),
  organisation_or_name text not null,
  email text not null,
  postcode text not null,
  details text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete set null,
  business_organisation_id uuid references public.organisations(id) on delete set null,
  address text not null,
  postcode text not null,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  customer_user_id uuid references public.profiles(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  customer_name text not null,
  email text not null,
  phone text not null,
  postcode text not null,
  address text not null,
  description text not null,
  urgency text not null check (urgency in ('routine','soon','urgent','emergency')),
  preferred_window text,
  service_key text,
  status public.job_status not null default 'new',
  matched_provider_id uuid references public.providers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_vertical_status_idx on public.jobs(vertical_id,status);
create index jobs_postcode_idx on public.jobs(postcode);

create table public.job_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered','accepted','declined','expired','cancelled')),
  rank smallint not null default 1,
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(job_id,provider_id)
);

create table public.coverage_waitlist (
  id uuid primary key default gen_random_uuid(),
  vertical_id text not null,
  area text not null,
  postcode text not null,
  customer_name text,
  email text,
  phone text,
  description text,
  created_at timestamptz not null default now()
);

create index coverage_waitlist_area_idx on public.coverage_waitlist(vertical_id,area);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  customer_user_id uuid references public.profiles(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  review text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace view public.public_provider_verification as
select
  p.public_slug,
  o.name as business_name,
  o.vertical_id,
  p.verification_state,
  p.verified_at,
  p.quality_score,
  coalesce(array_agg(distinct pc.area) filter (where pc.active),'{}') as coverage_areas,
  coalesce(array_agg(distinct ps.service_key) filter (where ps.active),'{}') as service_keys,
  min(pe.expires_at) filter (where pe.status='verified' and pe.expires_at is not null) as next_evidence_expiry
from public.providers p
join public.organisations o on o.id=p.organisation_id
left join public.provider_coverage pc on pc.provider_id=p.id
left join public.provider_services ps on ps.provider_id=p.id
left join public.provider_evidence pe on pe.provider_id=p.id
group by p.id,o.id;

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.providers enable row level security;
alter table public.provider_evidence enable row level security;
alter table public.provider_services enable row level security;
alter table public.provider_coverage enable row level security;
alter table public.properties enable row level security;
alter table public.jobs enable row level security;
alter table public.job_offers enable row level security;
alter table public.reviews enable row level security;

create policy "profiles own read" on public.profiles for select using (auth.uid()=id);
create policy "profiles own update" on public.profiles for update using (auth.uid()=id);
create policy "members see organisations" on public.organisations for select using (exists(select 1 from public.organisation_members m where m.organisation_id=id and m.user_id=auth.uid()));
create policy "members see membership" on public.organisation_members for select using (user_id=auth.uid());
create policy "customer properties" on public.properties for select using (owner_user_id=auth.uid() or exists(select 1 from public.organisation_members m where m.organisation_id=business_organisation_id and m.user_id=auth.uid()));
create policy "customer jobs" on public.jobs for select using (customer_user_id=auth.uid() or exists(select 1 from public.properties pr join public.organisation_members m on m.organisation_id=pr.business_organisation_id where pr.id=property_id and m.user_id=auth.uid()));
create policy "customer reviews" on public.reviews for select using (customer_user_id=auth.uid());

grant select on public.public_provider_verification to anon, authenticated;
grant select on public.service_areas to anon, authenticated;
