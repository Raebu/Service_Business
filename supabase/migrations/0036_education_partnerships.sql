-- Education partnership pipeline; candidate records are NOT outreach permissions.
alter table public.growth_outreach_queue drop constraint if exists growth_outreach_queue_workstream_check;
alter table public.growth_outreach_queue add constraint growth_outreach_queue_workstream_check
check (workstream in ('provider_recruitment','corporate_acquisition','academy_employer','education_partnerships'));
alter table public.growth_campaigns drop constraint if exists growth_campaigns_workstream_check;
alter table public.growth_campaigns add constraint growth_campaigns_workstream_check
check (workstream in ('provider_recruitment','corporate_acquisition','academy_employer','education_partnerships'));
alter table public.growth_meeting_requests drop constraint if exists growth_meeting_requests_workstream_check;
alter table public.growth_meeting_requests add constraint growth_meeting_requests_workstream_check
check (workstream in ('provider_recruitment','corporate_acquisition','academy_employer','education_partnerships'));

create table if not exists public.growth_education_partnerships (
  prospect_id uuid primary key references public.growth_outreach_queue(id) on delete cascade,
  institution_type text not null check (institution_type in
    ('university','further_education_college','sixth_form_college','apprenticeship_provider',
     'independent_training_provider','adult_education','skills_bootcamp','other')),
  interests text[] not null default '{}',
  region text,
  stage text not null default 'research' check(stage in
    ('research','qualification','intro_approved','engaged','meeting_requested','exploring','agreement_review','active','closed')),
  safeguarding_review text not null default 'not_started' check(safeguarding_review in ('not_started','in_review','approved','not_applicable')),
  partnership_terms_review text not null default 'not_started' check(partnership_terms_review in ('not_started','in_review','approved')),
  qualification_notes text,
  contact_owner text,
  next_follow_up_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists growth_education_stage_idx on public.growth_education_partnerships(stage,next_follow_up_at);
alter table public.growth_education_partnerships enable row level security;
revoke all on public.growth_education_partnerships from anon,authenticated;

-- A recorded follow-up is not approval for an email. Outbound eligibility still uses the
-- separate 0034 campaign, named-contact, legal basis and suppression controls.
create table if not exists public.growth_partnership_interactions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.growth_outreach_queue(id) on delete cascade,
  interaction_type text not null check(interaction_type in ('research','email_draft','reply','meeting_request','meeting_held','proposal','due_diligence','agreement')),
  summary text not null,
  source_reference text,
  requires_review boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists growth_partnership_interactions_idx on public.growth_partnership_interactions(prospect_id,created_at desc);
alter table public.growth_partnership_interactions enable row level security;
revoke all on public.growth_partnership_interactions from anon,authenticated;
