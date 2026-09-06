alter table public.follow_on_quotes
  add column if not exists settlement_status text not null default 'not_ready'
    check (settlement_status in ('not_ready','held','eligible','transferring','transferred','blocked','reversed')),
  add column if not exists stripe_transfer_id text,
  add column if not exists transferred_at timestamptz;

create unique index if not exists follow_on_quotes_transfer_uidx
  on public.follow_on_quotes(stripe_transfer_id)
  where stripe_transfer_id is not null;

create index if not exists follow_on_quotes_settlement_idx
  on public.follow_on_quotes(payment_status,settlement_status,created_at);
