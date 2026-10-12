-- AutonomyOS durability and audit. OFF by default. This migration never executes external actions.
create table public.autonomy_controls (
  domain text primary key check(domain in ('operations','communications','growth','partnerships','finance','assurance')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.autonomy_controls(domain)
values ('operations'),('communications'),('growth'),('partnerships'),('finance'),('assurance');

create table public.autonomy_workflows (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in (
    'dispatch','notifications','compliance','recovery_monitor','sla_monitor',
    'reconciliation','operational_kpis','quality_ranking','labour_demand',
    'coverage_recruitment','finance_close','reserves','competency_lifecycle',
    'provider_nurture','growth_intelligence','growth_outreach',
    'education_discovery','approved_calendar_booking','assurance'
  )),
  domain text not null references public.autonomy_controls(domain),
  idempotency_key text not null unique check(length(idempotency_key) between 5 and 180),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  status text not null default 'queued' check(status in ('queued','leased','succeeded','dead','cancelled')),
  priority smallint not null default 50 check(priority between 0 and 100),
  attempts integer not null default 0 check(attempts>=0),
  max_attempts integer not null default 4 check(max_attempts between 1 and 8),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status='leased') = (lease_token is not null and lease_until is not null))
);
create index autonomy_workflows_due_idx on public.autonomy_workflows(status,available_at,priority desc);
create index autonomy_workflows_lease_idx on public.autonomy_workflows(lease_until) where status='leased';

create table public.autonomy_execution_events (
  id bigint generated always as identity primary key,
  workflow_id uuid not null references public.autonomy_workflows(id),
  attempt integer not null,
  event_type text not null check(event_type in ('queued','claimed','succeeded','retry_scheduled','dead_lettered','cancelled','lease_expired')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index autonomy_events_workflow_idx on public.autonomy_execution_events(workflow_id,created_at desc);

create table public.autonomy_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  workflow_id uuid references public.autonomy_workflows(id),
  severity text not null check(severity in ('low','medium','high','critical')),
  category text not null,
  summary text not null,
  status text not null default 'open' check(status in ('open','acknowledged','resolved')),
  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index autonomy_incidents_status_idx on public.autonomy_incidents(status,severity,last_seen_at);

create table public.autonomy_recommendations (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null unique,
  category text not null check(category in ('supply','growth','finance','quality','expansion','security')),
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  proposed_action text not null,
  confidence numeric(4,3) not null check(confidence between 0 and 1),
  status text not null default 'review' check(status in ('review','approved','dismissed','actioned')),
  created_at timestamptz not null default now()
);

alter table public.autonomy_controls enable row level security;
alter table public.autonomy_workflows enable row level security;
alter table public.autonomy_execution_events enable row level security;
alter table public.autonomy_incidents enable row level security;
alter table public.autonomy_recommendations enable row level security;
revoke all on public.autonomy_controls,public.autonomy_workflows,public.autonomy_execution_events,
 public.autonomy_incidents,public.autonomy_recommendations from public,anon,authenticated;

-- Only allow predefined workflow kinds with a fixed domain mapping.
create or replace function public.autonomy_domain(p_kind text)
returns text language sql immutable as $$
select case
  when p_kind in ('dispatch','compliance','recovery_monitor','sla_monitor','competency_lifecycle') then 'operations'
  when p_kind='notifications' then 'communications'
  when p_kind in ('coverage_recruitment','growth_intelligence','growth_outreach') then 'growth'
  when p_kind in ('education_discovery','approved_calendar_booking','provider_nurture') then 'partnerships'
  when p_kind in ('reconciliation','finance_close','reserves') then 'finance'
  when p_kind in ('operational_kpis','quality_ranking','labour_demand','assurance') then 'assurance'
  else null end;
$$;

create or replace function public.autonomy_enqueue(p_kind text,p_idempotency_key text,
 p_payload jsonb default '{}'::jsonb,p_available_at timestamptz default now())
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_domain text:=public.autonomy_domain(p_kind);
begin
 if v_domain is null or length(p_idempotency_key) not between 5 and 180
    or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>8192
    or p_available_at>now()+interval '90 days' then raise exception 'invalid_autonomy_request'; end if;
 insert into public.autonomy_workflows(kind,domain,idempotency_key,payload,available_at)
 values(p_kind,v_domain,p_idempotency_key,p_payload,p_available_at)
 on conflict(idempotency_key) do nothing returning id into v_id;
 if v_id is null then
   select id into v_id from public.autonomy_workflows
   where idempotency_key=p_idempotency_key and kind=p_kind;
   if v_id is null then raise exception 'workflow_idempotency_conflict'; end if;
 else
   insert into public.autonomy_execution_events(workflow_id,attempt,event_type)
     values(v_id,0,'queued');
 end if;
 return v_id;
end;$$;

create or replace function public.autonomy_claim(p_limit integer default 5)
returns table(id uuid,kind text,domain text,attempt integer,lease_token uuid,payload jsonb)
language plpgsql security definer set search_path=public as $$
declare task record; new_token uuid; max_batch integer:=least(greatest(coalesce(p_limit,1),1),10);
begin
 for task in
   select w.* from public.autonomy_workflows w
   join public.autonomy_controls ctl on ctl.domain=w.domain
   where ctl.enabled=true
     and ((w.status='queued' and w.available_at<=now())
       or (w.status='leased' and w.lease_until<now()))
     and w.attempts<w.max_attempts
   order by w.priority desc,w.available_at asc,w.created_at asc
   for update of w skip locked limit max_batch
 loop
   if task.status='leased' then
     insert into public.autonomy_execution_events(workflow_id,attempt,event_type)
     values(task.id,task.attempts,'lease_expired');
   end if;
   new_token:=gen_random_uuid();
   update public.autonomy_workflows w set
    status='leased',lease_token=new_token,lease_until=now()+interval '4 minutes',
    attempts=w.attempts+1,updated_at=now()
   where w.id=task.id;
   insert into public.autonomy_execution_events(workflow_id,attempt,event_type)
   values(task.id,task.attempts+1,'claimed');
   id:=task.id;kind:=task.kind;domain:=task.domain;attempt:=task.attempts+1;
   lease_token:=new_token;payload:=task.payload;
   return next;
 end loop;
 -- Expired final leases must become dead letters WITH a matching audit incident.
 for task in select w.id,w.attempts from public.autonomy_workflows w
   where w.status='leased' and w.lease_until<now() and w.attempts>=w.max_attempts
   for update of w skip locked limit 100
 loop
   update public.autonomy_workflows set
     status='dead',lease_token=null,lease_until=null,
     completed_at=now(),updated_at=now(),last_error_code='lease_expired_max_attempts'
   where id=task.id;
   insert into public.autonomy_execution_events(workflow_id,attempt,event_type,details)
     values(task.id,task.attempts,'dead_lettered','{"reason":"expired_final_lease"}');
   insert into public.autonomy_incidents(fingerprint,workflow_id,severity,category,summary)
   values('dead:'||task.id,task.id,'high','workflow','Workflow expired its final execution lease')
   on conflict(fingerprint) do update set
     occurrences=public.autonomy_incidents.occurrences+1,last_seen_at=now();
 end loop;
end;$;

create or replace function public.autonomy_finish(p_id uuid,p_lease_token uuid,
 p_success boolean,p_error_code text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare task record; target_status text;wait_seconds int;
begin
 select * into task from public.autonomy_workflows
 where id=p_id and status='leased' and lease_token=p_lease_token and lease_until>=now()
 for update;
 if not found then return false; end if;
 target_status:=case when p_success then 'succeeded'
   when task.attempts>=task.max_attempts then 'dead' else 'queued' end;
 wait_seconds:=least(3600,30*power(3,greatest(0,task.attempts-1)))::integer;
 update public.autonomy_workflows set
   status=target_status,lease_token=null,lease_until=null,
   completed_at=case when target_status in ('succeeded','dead') then now() else null end,
   available_at=case when target_status='queued' then now()+make_interval(secs=>wait_seconds)
      else available_at end,
   last_error_code=case when p_success then null else left(coalesce(p_error_code,'unknown_failure'),90) end,
   updated_at=now()
 where id=p_id;
 insert into public.autonomy_execution_events(workflow_id,attempt,event_type,details)
 values(p_id,task.attempts,
   case when target_status='succeeded' then 'succeeded'
        when target_status='dead' then 'dead_lettered' else 'retry_scheduled' end,
   case when p_success then '{}'::jsonb else jsonb_build_object('error_code',left(coalesce(p_error_code,'unknown_failure'),90)) end);
 if target_status='dead' then
   insert into public.autonomy_incidents(fingerprint,workflow_id,severity,category,summary)
   values('dead:'||p_id,p_id,'high','workflow','Workflow exhausted its safe retry limit')
   on conflict(fingerprint) do update set
     occurrences=public.autonomy_incidents.occurrences+1,last_seen_at=now();
 end if;
 return true;
end;$$;

create or replace function public.autonomy_cancel(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare n int;
begin
 update public.autonomy_workflows set
   status='cancelled',lease_token=null,lease_until=null,completed_at=now(),updated_at=now()
 where id=p_id and status='queued';
 get diagnostics n=row_count;
 if n=1 then insert into public.autonomy_execution_events(workflow_id,attempt,event_type)
 select id,attempts,'cancelled' from public.autonomy_workflows where id=p_id; end if;
 return n=1;
end;$$;

revoke all on function public.autonomy_domain(text),public.autonomy_enqueue(text,text,jsonb,timestamptz),
 public.autonomy_claim(integer),public.autonomy_finish(uuid,uuid,boolean,text),
 public.autonomy_cancel(uuid) from public,anon,authenticated;
grant execute on function public.autonomy_domain(text),public.autonomy_enqueue(text,text,jsonb,timestamptz),
 public.autonomy_claim(integer),public.autonomy_finish(uuid,uuid,boolean,text),
 public.autonomy_cancel(uuid) to service_role;

-- Audits cannot be altered after creation, even by normal service-role clients.
create or replace function public.prevent_autonomy_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
 raise exception 'autonomy_execution_history_is_append_only';
end;$$;
create trigger autonomy_execution_events_immutable
before update or delete on public.autonomy_execution_events
for each row execute function public.prevent_autonomy_event_mutation();
