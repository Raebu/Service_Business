-- Academy, learner, supervised-work and new-business progression engine.

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  education_organisation_id uuid references public.organisations(id) on delete set null,
  display_name text not null,
  email text,
  postcode text not null,
  age_band text not null default '18_plus' check (age_band in ('under_16','16_17','18_plus')),
  travel_radius_km numeric(8,2) not null default 15 check (travel_radius_km > 0 and travel_radius_km <= 250),
  has_own_transport boolean not null default false,
  current_stage text not null default 'learner' check (current_stage in ('exploring','learner','placement','apprentice','qualified','verified_provider','mentor')),
  qualification_summary text,
  desired_skills text[] not null default '{}',
  availability_summary text,
  status text not null default 'active' check (status in ('active','paused','completed','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learners_postcode_status_idx on public.learners(postcode,status);
create unique index learners_user_uidx on public.learners(user_id) where user_id is not null;

create table public.learner_consents (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  consent_type text not null check (consent_type in ('placement_matching','employer_sharing','evidence_recording','guardian_approval')),
  granted boolean not null,
  granted_by_name text,
  granted_by_relationship text,
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  notes text,
  unique(learner_id,consent_type,captured_at)
);
create index learner_consents_current_idx on public.learner_consents(learner_id,consent_type,captured_at desc);

create table public.employer_opportunities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  opportunity_type text not null check (opportunity_type in ('work_experience','placement','apprenticeship','trainee_job','qualified_job','mentoring')),
  title text not null,
  postcode text not null,
  places integer not null default 1 check (places > 0),
  minimum_stage text,
  desired_skills text[] not null default '{}',
  days_available text[] not null default '{}',
  paid boolean,
  compensation_notes text,
  supervisor_engineer_id uuid references public.engineers(id) on delete set null,
  status text not null default 'open' check (status in ('draft','open','paused','filled','closed')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index employer_opportunities_open_idx on public.employer_opportunities(status,postcode) where status='open';

create table public.placement_matches (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  opportunity_id uuid not null references public.employer_opportunities(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  distance_signal numeric(5,2) not null default 0,
  skill_signal numeric(5,2) not null default 0,
  demand_signal numeric(5,2) not null default 0,
  explanation jsonb not null default '{}'::jsonb,
  status text not null default 'suggested' check (status in ('suggested','learner_interested','employer_interested','mutual','rejected','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(learner_id,opportunity_id)
);

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete restrict,
  opportunity_id uuid references public.employer_opportunities(id) on delete set null,
  provider_id uuid not null references public.providers(id) on delete restrict,
  supervisor_engineer_id uuid references public.engineers(id) on delete set null,
  education_organisation_id uuid references public.organisations(id) on delete set null,
  placement_type text not null check (placement_type in ('work_experience','placement','apprenticeship','trainee_job','mentoring')),
  supervised_only boolean not null default true,
  starts_on date not null,
  ends_on date,
  status text not null default 'planned' check (status in ('planned','active','paused','completed','cancelled')),
  agreed_hours numeric(10,2),
  completed_hours numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index placements_learner_status_idx on public.placements(learner_id,status);
create index placements_provider_status_idx on public.placements(provider_id,status);

create table public.placement_competency_events (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  supervisor_engineer_id uuid references public.engineers(id) on delete set null,
  service_key text not null,
  activity text not null,
  hours numeric(8,2) not null check (hours > 0),
  level_observed text not null check (level_observed in ('observed','assisted','performed_supervised','demonstrated')),
  evidence_reference text,
  supervisor_verified boolean not null default false,
  supervisor_verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index placement_competency_learner_idx on public.placement_competency_events(learner_id,service_key,created_at desc);

create table public.business_setup_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  learner_id uuid references public.learners(id) on delete set null,
  email text not null,
  applicant_name text not null,
  qualification_summary text not null,
  desired_structure text check (desired_structure in ('undecided','sole_trader','limited_company')),
  status text not null default 'intake' check (status in ('intake','eligibility_review','structure_selected','filings_prepared','awaiting_approval','setup_complete','declined','withdrawn')),
  explicit_filing_consent boolean not null default false,
  company_name_choice text,
  company_number text,
  hmrc_setup_status text,
  insurance_status text,
  banking_status text,
  payments_status text,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progression_milestones (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  milestone_key text not null,
  label text not null,
  achieved_at timestamptz not null default now(),
  evidence_reference text,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(learner_id,milestone_key)
);

alter table public.learners enable row level security;
alter table public.learner_consents enable row level security;
alter table public.employer_opportunities enable row level security;
alter table public.placement_matches enable row level security;
alter table public.placements enable row level security;
alter table public.placement_competency_events enable row level security;
alter table public.business_setup_cases enable row level security;
alter table public.progression_milestones enable row level security;

create policy "learner sees self" on public.learners for select using (user_id=auth.uid() or exists(select 1 from public.organisation_members m where m.organisation_id=education_organisation_id and m.user_id=auth.uid()));
create policy "education members manage learners" on public.learners for all using (exists(select 1 from public.organisation_members m where m.organisation_id=education_organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','member'))) with check (exists(select 1 from public.organisation_members m where m.organisation_id=education_organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager','member')));
create policy "learner sees consents" on public.learner_consents for select using (exists(select 1 from public.learners l where l.id=learner_id and (l.user_id=auth.uid() or exists(select 1 from public.organisation_members m where m.organisation_id=l.education_organisation_id and m.user_id=auth.uid()))));
create policy "provider members see opportunities" on public.employer_opportunities for select using (exists(select 1 from public.providers p join public.organisation_members m on m.organisation_id=p.organisation_id where p.id=provider_id and m.user_id=auth.uid()));
create policy "provider managers manage opportunities" on public.employer_opportunities for all using (exists(select 1 from public.providers p join public.organisation_members m on m.organisation_id=p.organisation_id where p.id=provider_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))) with check (exists(select 1 from public.providers p join public.organisation_members m on m.organisation_id=p.organisation_id where p.id=provider_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager')));
create policy "placement parties see placements" on public.placements for select using (exists(select 1 from public.learners l where l.id=learner_id and l.user_id=auth.uid()) or exists(select 1 from public.providers p join public.organisation_members m on m.organisation_id=p.organisation_id where p.id=provider_id and m.user_id=auth.uid()) or exists(select 1 from public.organisation_members m where m.organisation_id=education_organisation_id and m.user_id=auth.uid()));
create policy "placement parties see evidence" on public.placement_competency_events for select using (exists(select 1 from public.placements p join public.learners l on l.id=p.learner_id where p.id=placement_id and l.user_id=auth.uid()) or exists(select 1 from public.placements pl join public.providers p on p.id=pl.provider_id join public.organisation_members m on m.organisation_id=p.organisation_id where pl.id=placement_id and m.user_id=auth.uid()) or exists(select 1 from public.placements pl join public.organisation_members m on m.organisation_id=pl.education_organisation_id where pl.id=placement_id and m.user_id=auth.uid()));
create policy "user sees own setup case" on public.business_setup_cases for select using (user_id=auth.uid() or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy "learner sees milestones" on public.progression_milestones for select using (exists(select 1 from public.learners l where l.id=learner_id and (l.user_id=auth.uid() or exists(select 1 from public.organisation_members m where m.organisation_id=l.education_organisation_id and m.user_id=auth.uid()))));

-- Match scores are generated by the service role and exposed only through controlled APIs.
revoke all on public.placement_matches from anon,authenticated;
grant select on public.learners,public.learner_consents,public.employer_opportunities,public.placements,public.placement_competency_events,public.business_setup_cases,public.progression_milestones to authenticated;
