-- Explicit reversal helper and stronger autonomous finance-close gates.

create or replace function public.reverse_finance_journal(
  p_entry_id uuid,
  p_reason text,
  p_source_id text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entry public.finance_journal_entries%rowtype;
  v_lines jsonb;
  v_new_id uuid;
  v_org uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'reversal_reason_required'; end if;
  select * into v_entry from public.finance_journal_entries where id=p_entry_id;
  if not found then raise exception 'journal_entry_not_found'; end if;
  if v_entry.source_type='journal_reversal' then raise exception 'cannot_reverse_a_reversal'; end if;

  select jsonb_agg(jsonb_build_object(
    'accountCode',l.account_code,
    'direction',case when l.direction='debit' then 'credit' else 'debit' end,
    'amountPence',l.amount_pence,
    'jobId',l.job_id,
    'organisationId',l.organisation_id,
    'providerId',l.provider_id,
    'metadata',l.metadata||jsonb_build_object('reversesLineId',l.id)
  ) order by l.id),max(l.organisation_id)
  into v_lines,v_org
  from public.finance_journal_lines l where l.entry_id=p_entry_id;

  if v_lines is null then raise exception 'journal_entry_has_no_lines'; end if;
  v_new_id:=public.post_finance_journal(
    'reversal:'||p_entry_id::text,
    'journal_reversal',
    coalesce(p_source_id,p_entry_id::text),
    v_entry.currency,
    v_lines,
    jsonb_build_object('reversesEntryId',p_entry_id,'reason',trim(p_reason),'originalSourceType',v_entry.source_type,'originalSourceId',v_entry.source_id)
  );
  update public.finance_journal_entries set organisation_id=coalesce(v_org,v_entry.organisation_id),tax_point=current_date,retention_until=(current_date+interval '6 years')::date where id=v_new_id;
  return v_new_id;
end;
$$;
revoke all on function public.reverse_finance_journal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reverse_finance_journal(uuid,text,text) to service_role;

create or replace function public.lock_finance_period(p_period_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_period public.finance_periods%rowtype;
begin
  select * into v_period from public.finance_periods where id=p_period_id for update;
  if not found then raise exception 'period_not_found'; end if;
  if v_period.status='locked' then return true; end if;

  if exists(
    select 1 from public.finance_reconciliation_exceptions e
    where e.organisation_id=v_period.organisation_id
      and e.status in ('open','investigating')
      and e.detected_at::date between v_period.starts_on and v_period.ends_on
  ) then raise exception 'period_has_open_reconciliation_exceptions'; end if;

  if exists(
    select 1 from public.jobs j
    join public.providers p on p.id=j.matched_provider_id
    where p.organisation_id=v_period.organisation_id
      and j.paid_at::date between v_period.starts_on and v_period.ends_on
      and j.payment_status in ('paid','partially_refunded','refunded','disputed')
      and j.payment_reconciled_at is null
  ) then raise exception 'period_has_unreconciled_payments'; end if;

  if exists(
    select 1 from public.job_cases c
    join public.jobs j on j.id=c.job_id
    join public.providers p on p.id=j.matched_provider_id
    where p.organisation_id=v_period.organisation_id
      and c.created_at::date<=v_period.ends_on
      and c.automation_state in ('eligible','processing','exception')
  ) then raise exception 'period_has_open_financial_recovery_cases'; end if;

  update public.finance_periods
  set status='locked',reconciled_at=coalesce(reconciled_at,now()),closed_at=coalesce(closed_at,now()),locked_at=now()
  where id=p_period_id;
  return true;
end;
$$;
revoke all on function public.lock_finance_period(uuid) from public,anon,authenticated;
grant execute on function public.lock_finance_period(uuid) to service_role;
