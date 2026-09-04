-- Payment reconciliation and immutable finance close controls.

alter table public.jobs
  add column if not exists stripe_processing_fee_pence integer check (stripe_processing_fee_pence is null or stripe_processing_fee_pence >= 0),
  add column if not exists stripe_net_received_pence integer,
  add column if not exists net_platform_margin_pence integer,
  add column if not exists payment_reconciled_at timestamptz;

create index if not exists jobs_payment_reconcile_idx on public.jobs(payment_status,payment_reconciled_at) where payment_status in ('paid','partially_refunded','refunded','disputed');

create or replace function public.lock_finance_period(p_period_id uuid)
returns boolean
language plpgsql
security definer set search_path=public
as $$
declare v_period public.finance_periods%rowtype;
begin
  select * into v_period from public.finance_periods where id=p_period_id for update;
  if not found then raise exception 'period_not_found'; end if;
  if exists(select 1 from public.finance_reconciliation_exceptions e where e.organisation_id=v_period.organisation_id and e.status in ('open','investigating') and e.detected_at::date between v_period.starts_on and v_period.ends_on) then
    raise exception 'period_has_open_reconciliation_exceptions';
  end if;
  update public.finance_periods set status='locked',reconciled_at=coalesce(reconciled_at,now()),closed_at=coalesce(closed_at,now()),locked_at=now() where id=p_period_id;
  return true;
end;
$$;
revoke all on function public.lock_finance_period(uuid) from public,anon,authenticated;
grant execute on function public.lock_finance_period(uuid) to service_role;

-- Journal rows are immutable after insert. Corrections must be new reversing/adjusting entries.
create or replace function public.prevent_finance_mutation()
returns trigger language plpgsql as $$ begin raise exception 'finance_records_are_append_only'; end; $$;
drop trigger if exists finance_entries_immutable on public.finance_journal_entries;
create trigger finance_entries_immutable before update or delete on public.finance_journal_entries for each row execute procedure public.prevent_finance_mutation();
drop trigger if exists finance_lines_immutable on public.finance_journal_lines;
create trigger finance_lines_immutable before update or delete on public.finance_journal_lines for each row execute procedure public.prevent_finance_mutation();
