-- Never reopen an in-flight or completed provider payout.
-- This closes the race where concurrent workers could change transferring back
-- to eligible after one worker had already claimed it.
create or replace function public.mark_job_settlement_eligible(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare eligible boolean;
declare changed_rows integer;
begin
  select exists(
    select 1 from public.jobs j
    join public.providers p on p.id=j.matched_provider_id
    where j.id=p_job_id and j.status='completed' and j.payment_status='paid'
      and j.provider_price_pence is not null and j.provider_price_pence>0
      and p.verification_state='active'
      and p.stripe_account_id is not null and p.stripe_transfers_active=true
      and not exists (
        select 1 from public.job_cases c
        where c.job_id=j.id and c.status not in ('resolved','closed')
          and c.case_type in ('complaint','dispute','rework','refund','safety')
      )
      and not exists (
        select 1 from public.provider_evidence e
        where e.provider_id=p.id and e.kind in ('insurance','qualification','scheme_membership')
          and (e.status<>'verified' or (e.expires_at is not null and e.expires_at<=now()))
      )
  ) into eligible;

  update public.jobs
  set settlement_status=case when eligible then 'eligible' else 'blocked' end,
      payment_updated_at=now()
  where id=p_job_id
    and settlement_status not in ('transferring','transferred','reversed');
  get diagnostics changed_rows=row_count;
  return eligible and changed_rows=1;
end;
$$;
revoke all on function public.mark_job_settlement_eligible(uuid) from public,anon,authenticated;
grant execute on function public.mark_job_settlement_eligible(uuid) to service_role;
