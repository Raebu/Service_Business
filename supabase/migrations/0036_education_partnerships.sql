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

-- Apollo discovery metadata; no personal email or obfuscated name is treated as verified.
create table if not exists public.growth_education_discovery (
  id uuid primary key default gen_random_uuid(),
  source_reference text not null unique,
  institution_name text not null,
  institution_domain text,
  suggested_role text,
  source_url text not null,
  status text not null default 'research' check(status in ('research','shortlisted','rejected','promoted')),
  discovered_at timestamptz not null default now()
);
alter table public.growth_education_discovery enable row level security;
revoke all on public.growth_education_discovery from anon,authenticated;

-- One transaction creates both CRM record and partnership detail. It cannot grant
-- marketing eligibility, consent, domain matching or sending rights.
create or replace function public.import_education_partnership_candidate(
  p_name text,p_domain text,p_source_reference text,p_source_url text,
  p_type text,p_interests text[] default '{}',p_region text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare lead_id uuid;
begin
  if length(trim(p_name))<2 or p_domain is null or length(trim(p_domain))<4
     or p_source_reference is null or length(trim(p_source_reference))<5
     or p_source_url not like 'https://%' or p_type not in
      ('university','further_education_college','sixth_form_college','apprenticeship_provider',
       'independent_training_provider','adult_education','skills_bootcamp','other')
  then raise exception 'invalid_education_candidate'; end if;
  select id into lead_id from public.growth_outreach_queue
    where workstream='education_partnerships' and source_reference=p_source_reference;
  if lead_id is null then
    insert into public.growth_outreach_queue
      (workstream,organisation_name,domain,source_reference,source_url,status,
       company_type,lawful_basis,email_verified,domain_matched,
       notes,score)
    values ('education_partnerships',left(trim(p_name),180),lower(trim(p_domain)),
      left(trim(p_source_reference),250),left(trim(p_source_url),800),'discovered',
      'unknown','unassessed',false,false,
      'Institution research candidate: no named verified contact or outreach authorisation.',0)
    on conflict do nothing returning id into lead_id;
    if lead_id is null then
      select id into lead_id from public.growth_outreach_queue
        where workstream='education_partnerships' and source_reference=p_source_reference;
    end if;
  end if;
  if lead_id is null then raise exception 'candidate_not_created'; end if;
  insert into public.growth_education_partnerships(prospect_id,institution_type,interests,region)
   values(lead_id,p_type,coalesce(p_interests,'{}'),left(p_region,150))
   on conflict(prospect_id) do nothing;
  return lead_id;
end;
$$;
revoke all on function public.import_education_partnership_candidate(text,text,text,text,text,text[],text)
  from public,anon,authenticated;
grant execute on function public.import_education_partnership_candidate(text,text,text,text,text,text[],text)
  to service_role;

-- These are drafts only. Human review and proper legal-basis approval are required.
insert into public.growth_campaigns(name,workstream,status,subject_template,message_template)
select 'Education partnerships — universities','education_partnerships','draft',
'Industry collaboration with {{organisationName}}',
'Hello {{contactName}},\n\nI am reaching out from Raeburn Services to explore potential collaboration with {{organisationName}} around employer engagement, work placements, student progression and practical industry projects.\n\nWe are developing a service-business and workforce platform, currently focused on electrical services. We would welcome a conversation about whether any of these areas are relevant to your institution. This is an invitation to explore possibilities, not a representation that funding, placements or formal approvals have already been secured.\n\nIf it is relevant, would a brief introductory conversation be useful?'
where not exists(select 1 from public.growth_campaigns where name='Education partnerships — universities');

insert into public.growth_campaigns(name,workstream,status,subject_template,message_template)
select 'Education partnerships — colleges and training','education_partnerships','draft',
'Employer engagement and practical skills at {{organisationName}}',
'Hello {{contactName}},\n\nI am contacting you on behalf of Raeburn Services to explore whether {{organisationName}} would be interested in discussing employer links, electrical skills, apprenticeship pathways and work experience where suitable.\n\nWe would be pleased to learn about your existing provision and discuss areas where an industry partnership could be valuable. Any formal arrangements would be subject to appropriate checks and agreement.\n\nWould an introductory discussion be worthwhile?'
where not exists(select 1 from public.growth_campaigns where name='Education partnerships — colleges and training');
