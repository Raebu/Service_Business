create type public.job_case_type as enum ('complaint','dispute','rework','refund','safety','other');
create type public.job_case_status as enum ('open','investigating','awaiting_customer','awaiting_provider','resolved','closed');

create table public.job_cases (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  case_type public.job_case_type not null,
  status public.job_case_status not null default 'open',
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  summary text not null,
  resolution text,
  opened_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_cases_status_idx on public.job_cases(status,priority,created_at desc);
create index job_cases_job_idx on public.job_cases(job_id);

create table public.provider_status_events (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  previous_state text not null,
  new_state text not null,
  reason text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.business_enquiries
  add column if not exists converted_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists converted_at timestamptz;

alter table public.provider_evidence
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provider-evidence','provider-evidence',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.set_provider_status(
  p_provider_id uuid,
  p_new_state text,
  p_reason text,
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_previous text;
begin
  if p_new_state not in ('pending','active','suspended','expired','revoked') then
    raise exception 'invalid provider state';
  end if;
  select verification_state into v_previous from public.providers where id=p_provider_id for update;
  if v_previous is null then raise exception 'provider not found'; end if;
  update public.providers set verification_state=p_new_state,updated_at=now() where id=p_provider_id;
  insert into public.provider_status_events(provider_id,previous_state,new_state,reason,actor_user_id)
  values(p_provider_id,v_previous,p_new_state,p_reason,p_actor_user_id);
end;
$$;

create or replace function public.process_expired_provider_evidence()
returns table(expired_evidence integer,affected_providers integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expired integer := 0;
  v_providers integer := 0;
begin
  update public.provider_evidence
  set status='expired'
  where status='verified' and expires_at is not null and expires_at<=now();
  get diagnostics v_expired = row_count;

  with affected as (
    select distinct p.id
    from public.providers p
    join public.provider_evidence e on e.provider_id=p.id
    where p.verification_state='active'
      and e.status='expired'
      and e.kind in ('business_identity','qualification','scheme_membership','insurance')
  )
  update public.providers p
  set verification_state='expired',updated_at=now()
  from affected a where p.id=a.id;
  get diagnostics v_providers = row_count;

  insert into public.provider_status_events(provider_id,previous_state,new_state,reason)
  select distinct p.id,'active','expired','Required verification evidence expired'
  from public.providers p
  join public.provider_evidence e on e.provider_id=p.id
  where p.verification_state='expired' and e.status='expired' and e.expires_at<=now();

  return query select v_expired,v_providers;
end;
$$;

create or replace function public.convert_business_enquiry(p_enquiry_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_enquiry public.business_enquiries%rowtype;
  v_org uuid;
begin
  select * into v_enquiry from public.business_enquiries where id=p_enquiry_id for update;
  if not found then raise exception 'business enquiry not found'; end if;
  if v_enquiry.converted_organisation_id is not null then return v_enquiry.converted_organisation_id; end if;

  insert into public.organisations(vertical_id,kind,name,status)
  values(v_enquiry.vertical_id,'business_client',v_enquiry.organisation,'active')
  returning id into v_org;

  update public.business_enquiries
  set status='converted',converted_organisation_id=v_org,converted_at=now()
  where id=p_enquiry_id;
  return v_org;
end;
$$;

alter table public.job_cases enable row level security;
alter table public.provider_status_events enable row level security;

create policy "customer sees own job cases" on public.job_cases for select using (
  exists(select 1 from public.jobs j where j.id=job_id and j.customer_user_id=auth.uid())
);
create policy "provider sees assigned job cases" on public.job_cases for select using (
  exists(
    select 1 from public.jobs j
    join public.providers p on p.id=j.matched_provider_id
    join public.organisation_members m on m.organisation_id=p.organisation_id
    where j.id=job_id and m.user_id=auth.uid()
  )
);
create policy "customer can create review" on public.reviews for insert with check (
  customer_user_id=auth.uid() and exists(
    select 1 from public.jobs j where j.id=job_id and j.customer_user_id=auth.uid() and j.status='completed'
  )
);

revoke all on function public.set_provider_status(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.process_expired_provider_evidence() from public,anon,authenticated;
revoke all on function public.convert_business_enquiry(uuid) from public,anon,authenticated;
grant execute on function public.set_provider_status(uuid,text,text,uuid) to service_role;
grant execute on function public.process_expired_provider_evidence() to service_role;
grant execute on function public.convert_business_enquiry(uuid) to service_role;
