-- Autonomous growth is private and OFF by default. No contact is mailed by applying this migration.
create table if not exists public.growth_controls (
  id boolean primary key default true check(id),
  outbound_enabled boolean not null default false,
  inbound_enabled boolean not null default false,
  follow_ups_enabled boolean not null default false,
  max_per_hour integer not null default 25 check(max_per_hour between 1 and 25),
  max_per_day integer not null default 100 check(max_per_day between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.growth_controls(id) values(true) on conflict do nothing;

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  workstream text not null check(workstream in ('provider_recruitment','corporate_acquisition','academy_employer')),
  status text not null default 'draft' check(status in ('draft','approved','paused','completed')),
  subject_template text not null,
  message_template text not null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (approved_at is not null and approved_by is not null))
);

alter table public.growth_outreach_queue
  add column if not exists campaign_id uuid references public.growth_campaigns(id) on delete set null,
  add column if not exists company_type text not null default 'unknown' check(company_type in ('corporate','individual','unknown')),
  add column if not exists domain_matched boolean not null default false,
  add column if not exists lawful_basis text not null default 'unassessed' check(lawful_basis in ('unassessed','legitimate_interests','consent','soft_opt_in')),
  add column if not exists lawful_basis_evidence text,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists privacy_notice_url text,
  add column if not exists source_url text,
  add column if not exists opt_out_token uuid not null default gen_random_uuid(),
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_contact_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists claimed_until timestamptz;
create unique index if not exists growth_opt_out_token_idx on public.growth_outreach_queue(opt_out_token);
create index if not exists growth_outreach_due_idx on public.growth_outreach_queue(status,next_contact_at) where direct_email is not null;

create table if not exists public.growth_suppressions (
  email text primary key check(email=lower(email)),
  reason text not null,
  source text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.growth_outreach_attempts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.growth_outreach_queue(id) on delete cascade,
  campaign_id uuid not null references public.growth_campaigns(id),
  email text not null,
  sequence integer not null,
  status text not null default 'claimed' check(status in ('claimed','sent','rejected','unknown')),
  provider_message_id text,
  error_code text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(prospect_id,sequence)
);
create index if not exists growth_attempts_hour_idx on public.growth_outreach_attempts(claimed_at desc);
create table if not exists public.growth_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  sender_email text not null,
  recipient_email text,
  subject text,
  text_excerpt text,
  classification text not null default 'review' check(classification in ('review','interested','question','not_interested','unsubscribe','bounce')),
  processed boolean not null default false,
  received_at timestamptz not null default now()
);
create table if not exists public.growth_automation_runs (
  id uuid primary key default gen_random_uuid(),
  worker text not null,
  status text not null check(status in ('disabled','success','partial_failure','error')),
  summary jsonb not null default '{}'::jsonb,
  ran_at timestamptz not null default now()
);

alter table public.growth_controls enable row level security;
alter table public.growth_campaigns enable row level security;
alter table public.growth_suppressions enable row level security;
alter table public.growth_outreach_attempts enable row level security;
alter table public.growth_inbound_messages enable row level security;
alter table public.growth_automation_runs enable row level security;
revoke all on public.growth_controls,public.growth_campaigns,public.growth_suppressions,
  public.growth_outreach_attempts,public.growth_inbound_messages,public.growth_automation_runs from anon,authenticated;

-- DB-level atomic claiming and limits cannot be bypassed by concurrent workers.
create or replace function public.claim_growth_outreach_batch(p_limit integer default 5)
returns table(attempt_id uuid,prospect_id uuid,campaign_id uuid,email text,contact_name text,
  organisation_name text,workstream text,opt_out_token uuid)
language plpgsql security definer set search_path=public as $$
declare hourly_limit integer;daily_limit integer;available integer;v uuid; candidate record; attempt uuid;
begin
  perform pg_advisory_xact_lock(7940317);
  select least(max_per_hour,25),least(max_per_day,100) into hourly_limit,daily_limit
  from public.growth_controls where id=true and outbound_enabled=true;
  if hourly_limit is null then return; end if;
  available:=least(greatest(coalesce(p_limit,1),1),25,
    greatest(0,hourly_limit-(select count(*) from public.growth_outreach_attempts where claimed_at>now()-interval '1 hour')),
    greatest(0,daily_limit-(select count(*) from public.growth_outreach_attempts where claimed_at>now()-interval '1 day')));
  if available<1 then return; end if;
  for candidate in
    select q.*,c.workstream as campaign_workstream from public.growth_outreach_queue q
    join public.growth_campaigns c on c.id=q.campaign_id
    where q.status in ('ready','contacted')
      and c.status='approved' and c.approved_by is not null
      and q.workstream=c.workstream
      and q.direct_email is not null and q.email_verified and q.domain_matched
      and q.generic_email_rejected=false
      and q.contact_name is not null and length(trim(q.contact_name))>1
      and q.domain is not null and lower(split_part(q.direct_email,'@',2))=lower(q.domain)
      and q.source_url is not null and q.privacy_notice_url is not null
      and q.lawful_basis_evidence is not null and length(trim(q.lawful_basis_evidence))>12
      and ((q.company_type='corporate' and q.lawful_basis in ('legitimate_interests','consent'))
        or (q.company_type='individual' and q.lawful_basis in ('consent','soft_opt_in') and q.marketing_consent_at is not null))
      and (q.attempt_count=0 or (select follow_ups_enabled from public.growth_controls where id=true))
      and q.attempt_count<3 and q.replied_at is null
      and (q.next_contact_at is null or q.next_contact_at<=now())
      and not exists(select 1 from public.growth_suppressions s where s.email=lower(q.direct_email))
      and not exists(select 1 from public.growth_suppressions s where s.email='*@'||lower(q.domain))
      and not exists(select 1 from public.growth_outreach_attempts a where a.prospect_id=q.id and a.status in ('claimed','unknown'))
    order by q.score desc,q.created_at asc for update of q skip locked limit available
  loop
    insert into public.growth_outreach_attempts(prospect_id,campaign_id,email,sequence)
      values(candidate.id,candidate.campaign_id,lower(candidate.direct_email),candidate.attempt_count+1)
      returning id into attempt;
    update public.growth_outreach_queue q
      set attempt_count=attempt_count+1,claimed_until=now()+interval '30 minutes',updated_at=now()
      where q.id=candidate.id;
    attempt_id:=attempt;prospect_id:=candidate.id;campaign_id:=candidate.campaign_id;
    email:=candidate.direct_email;contact_name:=candidate.contact_name;
    organisation_name:=candidate.organisation_name;workstream:=candidate.workstream;
    opt_out_token:=candidate.opt_out_token;
    return next;
  end loop;
end;
$$;

create or replace function public.finish_growth_outreach_attempt(p_attempt_id uuid,p_status text,
  p_provider_message_id text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare a record;
begin
  if p_status not in ('sent','rejected','unknown') then return false; end if;
  update public.growth_outreach_attempts
  set status=p_status,provider_message_id=p_provider_message_id,error_code=left(p_error_code,150),completed_at=now()
  where id=p_attempt_id and status='claimed' returning * into a;
  if not found then return false; end if;
  update public.growth_outreach_queue
  set status=case when p_status='sent' then 'contacted'
                  when p_status='unknown' then 'paused' else 'ready' end,
      last_contacted_at=case when p_status='sent' then now() else last_contacted_at end,
      next_contact_at=case when p_status='sent' and attempt_count<3 then now()+interval '7 days'
                           when p_status='rejected' and attempt_count<3 then now()+interval '1 day'
                           else null end,
      claimed_until=null,updated_at=now()
  where id=a.prospect_id;
  return true;
end;
$$;

create or replace function public.suppress_growth_email(p_email text,p_reason text,p_source text)
returns void language plpgsql security definer set search_path=public as $$
declare e text:=lower(trim(p_email));
begin
  if e not like '%@%.%' or length(e)>320 then raise exception 'invalid_email'; end if;
  insert into public.growth_suppressions(email,reason,source) values(e,left(p_reason,160),left(p_source,100))
  on conflict(email) do update set reason=excluded.reason,source=excluded.source;
  update public.growth_outreach_queue
    set status='paused',replied_at=coalesce(replied_at,now()),updated_at=now()
  where lower(direct_email)=e;
end;
$$;

create or replace function public.unsubscribe_growth_token(p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare e text;
begin
  select lower(direct_email) into e from public.growth_outreach_queue
  where opt_out_token=p_token and direct_email is not null;
  if e is null then return false; end if;
  perform public.suppress_growth_email(e,'Unsubscribed via preference link','one_click');
  return true;
end;
$$;

revoke all on function public.claim_growth_outreach_batch(integer) from public,anon,authenticated;
revoke all on function public.finish_growth_outreach_attempt(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.suppress_growth_email(text,text,text) from public,anon,authenticated;
revoke all on function public.unsubscribe_growth_token(uuid) from public,anon,authenticated;
grant execute on function public.claim_growth_outreach_batch(integer) to service_role;
grant execute on function public.finish_growth_outreach_attempt(uuid,text,text,text) to service_role;
grant execute on function public.suppress_growth_email(text,text,text) to service_role;
grant execute on function public.unsubscribe_growth_token(uuid) to service_role;
