-- Link individual engineer records to auth users and prevent unsafe unsupervised status.

create index if not exists engineers_email_idx on public.engineers(lower(email)) where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',new.email))
  on conflict (id) do nothing;

  update public.jobs
  set customer_user_id=new.id
  where customer_user_id is null and new.email is not null and lower(email)=lower(new.email);

  update public.properties p
  set owner_user_id=new.id
  from public.jobs j
  where p.id=j.property_id and j.customer_user_id=new.id and p.owner_user_id is null;

  if new.email is not null then
    insert into public.organisation_members(organisation_id,user_id,role)
    select o.id,new.id,'owner'
    from public.organisations o
    where o.contact_email is not null and lower(o.contact_email)=lower(new.email)
    on conflict (organisation_id,user_id) do nothing;

    update public.engineers e
    set user_id=new.id,updated_at=now()
    where e.user_id is null and e.email is not null and lower(e.email)=lower(new.email);

    insert into public.organisation_members(organisation_id,user_id,role)
    select e.organisation_id,new.id,
      case when e.employment_role='owner' then 'owner'
           when e.employment_role='dispatcher' then 'dispatcher'
           else 'member' end
    from public.engineers e
    where e.user_id=new.id
    on conflict (organisation_id,user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_engineer_unsupervised_safety()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.employment_role in ('apprentice','trainee') then
    new.can_work_unsupervised:=false;
  end if;

  if new.can_work_unsupervised and not exists(
    select 1 from public.engineer_competencies c
    where c.engineer_id=new.id
      and c.verified=true
      and c.competency_level in ('competent','advanced')
      and (c.expires_at is null or c.expires_at>now())
  ) then
    raise exception 'verified_competency_required_for_unsupervised_work';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_engineer_unsupervised_safety_trigger on public.engineers;
create trigger enforce_engineer_unsupervised_safety_trigger
before insert or update of can_work_unsupervised,employment_role on public.engineers
for each row execute procedure public.enforce_engineer_unsupervised_safety();

create or replace function public.refresh_engineer_unsupervised_status(p_engineer_id uuid)
returns boolean
language plpgsql
security definer set search_path=public
as $$
declare
  eligible boolean;
begin
  select exists(
    select 1 from public.engineer_competencies c
    join public.engineers e on e.id=c.engineer_id
    where c.engineer_id=p_engineer_id
      and e.employment_role not in ('apprentice','trainee')
      and c.verified=true
      and c.competency_level in ('competent','advanced')
      and (c.expires_at is null or c.expires_at>now())
  ) into eligible;

  update public.engineers set can_work_unsupervised=eligible,updated_at=now() where id=p_engineer_id;
  return eligible;
end;
$$;

revoke all on function public.refresh_engineer_unsupervised_status(uuid) from public,anon,authenticated;
grant execute on function public.refresh_engineer_unsupervised_status(uuid) to service_role;
