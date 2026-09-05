-- Stripe corporate invoicing lifecycle. The platform remains the source of truth
-- for service/job economics; Stripe provides invoice delivery and payment state.

alter table public.corporate_invoice_runs
  add column if not exists stripe_invoice_status text,
  add column if not exists hosted_invoice_url text,
  add column if not exists invoice_pdf_url text,
  add column if not exists issued_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_updated_at timestamptz;

create index if not exists corporate_invoice_runs_stripe_invoice_idx
  on public.corporate_invoice_runs(stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists corporate_invoice_runs_ready_idx
  on public.corporate_invoice_runs(status,period_end)
  where status in ('ready','issued');
