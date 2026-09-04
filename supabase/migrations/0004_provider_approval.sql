alter table public.organisations add column if not exists contact_email text;
create index if not exists organisations_contact_email_idx on public.organisations(lower(contact_email));

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
  end if;

  return new;
end;
$$;

create or replace function public.approve_provider_application(
  p_application_id uuid,
  p_public_slug text,
  p_evidence jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  app public.provider_applications%rowtype;
  new_org_id uuid;
  new_provider_id uuid;
  existing_user_id uuid;
begin
  select * into app
  from public.provider_applications
  where id=p_application_id
  for update;

  if app.id is null then
    raise exception 'provider_application_not_found';
  end if;

  if app.status='verified' then
    select id into new_provider_id from public.providers where application_id=app.id;
    return new_provider_id;
  end if;

  if app.status not in ('submitted','screening','evidence_required') then
    raise exception 'provider_application_not_approvable';
  end if;

  if p_public_slug is null or p_public_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_public_slug';
  end if;

  if not exists(select 1 from jsonb_array_elements(p_evidence) e where e->>'kind'='business_identity') then
    raise exception 'business_identity_evidence_required';
  end if;
  if not exists(select 1 from jsonb_array_elements(p_evidence) e where e->>'kind'='insurance') then
    raise exception 'insurance_evidence_required';
  end if;
  if not exists(select 1 from jsonb_array_elements(p_evidence) e where e->>'kind' in ('qualification','scheme_membership')) then
    raise exception 'qualification_or_scheme_evidence_required';
  end if;

  insert into public.organisations(vertical_id,kind,name,company_number,website,contact_email,status)
  values(app.vertical_id,'provider_business',app.business_name,app.company_number,app.website,lower(app.email),'active')
  returning id into new_org_id;

  insert into public.providers(organisation_id,application_id,public_slug,verification_state,verified_at)
  values(new_org_id,app.id,p_public_slug,'active',now())
  returning id into new_provider_id;

  insert into public.provider_services(provider_id,service_key,active)
  select new_provider_id,service,true from unnest(app.services) service
  on conflict (provider_id,service_key) do update set active=true;

  insert into public.provider_coverage(provider_id,area,active,priority)
  select new_provider_id,upper(trim(area)),true,100 from unnest(app.coverage_areas) area
  where trim(area)<>''
  on conflict (provider_id,area) do update set active=true;

  insert into public.provider_evidence(provider_id,kind,label,reference,status,verified_at,expires_at)
  select
    new_provider_id,
    item->>'kind',
    item->>'label',
    nullif(item->>'reference',''),
    'verified'::public.verification_status,
    now(),
    nullif(item->>'expiresAt','')::timestamptz
  from jsonb_array_elements(p_evidence) item;

  update public.provider_applications
  set status='verified',updated_at=now()
  where id=app.id;

  select id into existing_user_id from auth.users where email is not null and lower(email)=lower(app.email) limit 1;
  if existing_user_id is not null then
    insert into public.organisation_members(organisation_id,user_id,role)
    values(new_org_id,existing_user_id,'owner')
    on conflict (organisation_id,user_id) do nothing;
  end if;

  insert into public.audit_events(event_type,entity_type,entity_id,metadata)
  values('provider_verified','provider',new_provider_id::text,jsonb_build_object('application_id',app.id,'organisation_id',new_org_id));

  return new_provider_id;
end;
$$;

revoke all on function public.approve_provider_application(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.approve_provider_application(uuid,text,jsonb) to service_role;
