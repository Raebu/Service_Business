-- Deterministic service-recovery automation. Financial actions remain policy-driven and auditable.

alter table public.job_cases
  add column if not exists policy_code text,
  add column if not exists automation_state text not null default 'not_eligible' check (automation_state in ('not_eligible','eligible','processing','completed','exception')),
  add column if not exists automation_action text check (automation_action is null or automation_action in ('refund_full','refund_partial','rework','reassign','none')),
  add column if not exists refund_pence integer check (refund_pence is null or refund_pence >= 0),
  add column if not exists automated_at timestamptz,
  add column if not exists automation_error text;

create table public.service_recovery_policies (
  code text primary key,
  label text not null,
  case_type public.job_case_type not null,
  trigger_party text not null check (trigger_party in ('customer','provider','platform','payment')),
  action text not null check (action in ('refund_full','refund_partial','rework','reassign','none')),
  refund_percent numeric(5,2) check (refund_percent is null or (refund_percent between 0 and 100)),
  requires_payment boolean not null default true,
  requires_no_open_safety_case boolean not null default true,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_recovery_policies(code,label,case_type,trigger_party,action,refund_percent,requires_payment,requires_no_open_safety_case,description)
values
  ('provider_no_show_full_refund','Provider no-show — full refund','refund','provider','refund_full',100,true,true,'Objective provider no-show confirmed by operations or telemetry. Refund the customer in full and block provider settlement.'),
  ('duplicate_payment_full_refund','Duplicate payment — full refund','refund','payment','refund_full',100,true,true,'Confirmed duplicate payment. Refund the duplicate customer amount in full.'),
  ('provider_rework_required','Provider rework required','rework','provider','rework',null,false,true,'Work requires remediation. Block settlement and route the job into rework before any automatic refund decision.')
on conflict (code) do update set label=excluded.label,case_type=excluded.case_type,trigger_party=excluded.trigger_party,action=excluded.action,refund_percent=excluded.refund_percent,requires_payment=excluded.requires_payment,requires_no_open_safety_case=excluded.requires_no_open_safety_case,active=true,version=public.service_recovery_policies.version+1,description=excluded.description,updated_at=now();

create index if not exists job_cases_automation_idx on public.job_cases(automation_state,case_type,created_at) where automation_state in ('eligible','processing','exception');

alter table public.service_recovery_policies enable row level security;
revoke all on public.service_recovery_policies from anon;
grant select on public.service_recovery_policies to authenticated;
create policy "authenticated can read recovery policies" on public.service_recovery_policies for select to authenticated using (active=true);

-- Financial automation tables are not writable by browser clients.
revoke update(policy_code,automation_state,automation_action,refund_pence,automated_at,automation_error) on public.job_cases from anon,authenticated;
