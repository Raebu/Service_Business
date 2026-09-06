alter table public.follow_on_quotes
  add column if not exists payment_status text not null default 'not_started'
    check (payment_status in ('not_started','checkout_created','processing','paid','failed','refunded','partially_refunded')),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_group text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_updated_at timestamptz,
  add column if not exists refunded_pence integer not null default 0 check (refunded_pence >= 0);

create unique index if not exists follow_on_quotes_checkout_session_uidx
  on public.follow_on_quotes(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists follow_on_quotes_payment_intent_uidx
  on public.follow_on_quotes(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists follow_on_quotes_job_payment_idx
  on public.follow_on_quotes(job_id,status,payment_status,created_at desc);
