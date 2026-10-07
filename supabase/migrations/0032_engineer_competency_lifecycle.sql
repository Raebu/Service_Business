-- Service-specific engineer competency enforcement and automatic expiry lifecycle.

create or replace function public.engineer_has_service_competency(
  p_engineer_id uuid,
  p_service_key text,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.engineers e
    join public.engineer_competencies c on c.engineer_id=e.id
    where e.id=p_engineer_id
      and e.status='active'
      and e.employment_role not in ('apprentice','trainee')
      and e.can_work_unsupervised=true
      and c.service_key=p_service_key
      and c.verified=true
      and c.competency_level in ('competent','advanced')
      and (c.expires_at is null or c.expires_at>p_at)
  );
$$;

revoke all on function public.engineer_has_service_competency(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.engineer_has_service_competency(uuid,text,timestamptz) to service_role;

create or replace function public.refresh_all_engineer_competency_statuses()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  changed_count integer;
begin
  with eligibility as (
    select e.id,
           case
             when e.employment_role in ('apprentice','trainee') then false
             else exists(
               select 1
               from public.engineer_competencies c
               where c.engineer_id=e.id
                 and c.verified=true
                 and c.competency_level in ('competent','advanced')
                 and (c.expires_at is null or c.expires_at>now())
             )
           end as eligible
    from public.engineers e
  ),
  updated as (
    update public.engineers e
    set can_work_unsupervised=eligibility.eligible,
        updated_at=now()
    from eligibility
    where e.id=eligibility.id
      and e.can_work_unsupervised is distinct from eligibility.eligible
    returning e.id
  )
  select count(*) into changed_count from updated;

  return changed_count;
end;
$$;

revoke all on function public.refresh_all_engineer_competency_statuses() from public,anon,authenticated;
grant execute on function public.refresh_all_engineer_competency_statuses() to service_role;

create or replace function public.sync_engineer_competency_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target_engineer_id uuid;
begin
  target_engineer_id:=coalesce(new.engineer_id,old.engineer_id);
  perform public.refresh_engineer_unsupervised_status(target_engineer_id);
  return coalesce(new,old);
end;
$$;

drop trigger if exists sync_engineer_competency_status_trigger on public.engineer_competencies;
create trigger sync_engineer_competency_status_trigger
after insert or update or delete on public.engineer_competencies
for each row execute procedure public.sync_engineer_competency_status();

create or replace function public.enforce_offer_engineer_service_competency()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  required_service_key text;
begin
  if new.engineer_id is null or new.status not in ('offered','accepted') then
    return new;
  end if;

  select service_key into required_service_key
  from public.jobs
  where id=new.job_id;

  if required_service_key is not null
     and not public.engineer_has_service_competency(new.engineer_id,required_service_key,now()) then
    raise exception 'engineer_service_competency_required';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_offer_engineer_service_competency_trigger on public.job_offers;
create trigger enforce_offer_engineer_service_competency_trigger
before insert or update of engineer_id,status on public.job_offers
for each row execute procedure public.enforce_offer_engineer_service_competency();

-- Reconcile any stale global unsupervised flags immediately when the migration is applied.
select public.refresh_all_engineer_competency_statuses();
