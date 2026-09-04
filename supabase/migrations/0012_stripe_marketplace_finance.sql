-- Stripe marketplace payment, settlement and reconciliation state.

alter table public.providers
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text not null default 'not_started' check (stripe_account_status in ('not_started','pending','restricted','active','disabled')),
  add column if not exists stripe_transfers_active boolean not null default false,
  add column if not exists stripe_requirements jsonb not null default '{}'::jsonb,
  add column if not exists stripe_updated_at timestamptz;
create unique index if not exists providers_stripe_account_uidx on public.providers(stripe_account_id) where stripe_account_id is not null;

alter table public.jobs
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_transfer_group text,
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid','checkout_created','processing','paid','failed','partially_refunded','refunded','disputed')),
  add column if not exists settlement_status text not null default 'not_ready' check (settlement_status in ('not_ready','held','eligible','transferring','transferred','blocked','reversed')),
  add column if not exists payout_eligible_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists transferred_at timestamptz,
  add column if not exists refunded_pence integer not null default 0 check (refunded_pence >= 0),
  add column if not exists dispute_status text,
  add column if not exists payment_updated_at timestamptz;
create unique index if not exists jobs_checkout_session_uidx on public.jobs(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index if not exists jobs_settlement_ready_idx on public.jobs(settlement_status,payout_eligible_at) where settlement_status in ('held','eligible');

create table public.stripe_event_receipts (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamptz,
  processing_status text not null default 'processing' check (processing_status in ('processing','processed','failed','ignored')),
  job_id uuid references public.jobs(id) on delete set null,
  error_message text,
  payload_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_event_receipts enable row level security;
revoke all on public.stripe_event_receipts from anon,authenticated;

create table public.payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('refund','dispute','dispute_won','dispute_lost','transfer_reversal','manual_credit','manual_debit')),
  amount_pence integer not null check (amount_pence > 0),
  stripe_object_id text,
  reason text,
  status text not null default 'recorded',
  created_at timestamptz not null default now()
);
create index if not exists payment_adjustments_job_idx on public.payment_adjustments(job_id,created_at desc);
alter table public.payment_adjustments enable row level security;

create policy "customers see own payment adjustments" on public.payment_adjustments for select using (
  exists(select 1 from public.jobs j where j.id=job_id and j.customer_user_id=auth.uid())
);
create policy "provider members see job payment adjustments" on public.payment_adjustments for select using (
  exists(
    select 1 from public.jobs j
    join public.providers p on p.id=j.matched_provider_id
    join public.organisation_members m on m.organisation_id=p.organisation_id
    where j.id=job_id and m.user_id=auth.uid()
  )
);

create or replace function public.mark_job_settlement_eligible(p_job_id uuid)
returns boolean
language plpgsql
security definer set search_path=public
as $$
declare
  eligible boolean;
begin
  select exists(
    select 1 from public.jobs j
    join public.providers p on p.id=j.matched_provider_id
    where j.id=p_job_id
      and j.status='completed'
      and j.payment_status='paid'
      and j.provider_price_pence is not null
      and j.provider_price_pence>0
      and p.verification_state='active'
      and p.stripe_account_id is not null
      and p.stripe_transfers_active=true
      and not exists(
        select 1 from public.job_cases c
        where c.job_id=j.id and c.status not in ('resolved','closed')
          and c.case_type in ('complaint','dispute','rework','refund','safety')
      )
      and not exists(
        select 1 from public.provider_evidence e
        where e.provider_id=p.id and e.kind in ('insurance','qualification','scheme_membership')
          and (e.status<>'verified' or (e.expires_at is not null and e.expires_at<=now()))
      )
  ) into eligible;

  update public.jobs
  set settlement_status=case when eligible then 'eligible' else 'blocked' end,
      payment_updated_at=now()
  where id=p_job_id and settlement_status<>'transferred';

  return eligible;
end;
$$;
revoke all on function public.mark_job_settlement_eligible(uuid) from public,anon,authenticated;
grant execute on function public.mark_job_settlement_eligible(uuid) to service_role;
