-- Capability-based RLS completion.
-- Replaces hard-coded role-name checks on privileged mutations with the same
-- role_capabilities model used by server-side authorisation.

create or replace function public.has_org_capability(p_organisation_id uuid,p_capability text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.organisation_members m
    join public.role_capabilities c on c.role=m.role
    where m.organisation_id=p_organisation_id
      and m.user_id=auth.uid()
      and c.capability=p_capability
      and c.allowed=true
  );
$$;
revoke all on function public.has_org_capability(uuid,text) from public,anon;
grant execute on function public.has_org_capability(uuid,text) to authenticated,service_role;

insert into public.role_capabilities(role,capability,allowed) values
 ('owner','manage_learners',true),('admin','manage_learners',true),('manager','manage_learners',true),('member','manage_learners',true),
 ('owner','manage_opportunities',true),('admin','manage_opportunities',true),('manager','manage_opportunities',true),
 ('dispatcher','manage_opportunities',false),('engineer','manage_opportunities',false),('apprentice','manage_opportunities',false),('member','manage_opportunities',false)
on conflict (role,capability) do update set allowed=excluded.allowed;

drop policy if exists "managers manage engineers" on public.engineers;
create policy "capability manages engineers" on public.engineers for all
using (public.has_org_capability(organisation_id,'manage_team'))
with check (public.has_org_capability(organisation_id,'manage_team'));

drop policy if exists "managers manage competencies" on public.engineer_competencies;
create policy "capability manages competencies" on public.engineer_competencies for all
using (exists(select 1 from public.engineers e where e.id=engineer_id and public.has_org_capability(e.organisation_id,'manage_team')))
with check (exists(select 1 from public.engineers e where e.id=engineer_id and public.has_org_capability(e.organisation_id,'manage_team')));

drop policy if exists "provider managers manage rate cards" on public.provider_rate_cards;
create policy "pricing capability manages rate cards" on public.provider_rate_cards for all
using (public.has_org_capability(organisation_id,'manage_pricing'))
with check (public.has_org_capability(organisation_id,'manage_pricing'));

drop policy if exists "provider managers manage rate items" on public.provider_rate_items;
create policy "pricing capability manages rate items" on public.provider_rate_items for all
using (exists(select 1 from public.provider_rate_cards rc where rc.id=rate_card_id and public.has_org_capability(rc.organisation_id,'manage_pricing')))
with check (exists(select 1 from public.provider_rate_cards rc where rc.id=rate_card_id and public.has_org_capability(rc.organisation_id,'manage_pricing')));

drop policy if exists "provider managers manage travel bands" on public.provider_travel_bands;
create policy "pricing capability manages travel bands" on public.provider_travel_bands for all
using (public.has_org_capability(organisation_id,'manage_pricing'))
with check (public.has_org_capability(organisation_id,'manage_pricing'));

drop policy if exists "finance managers manage accounting profile" on public.accounting_profiles;
create policy "finance capability manages accounting profile" on public.accounting_profiles for all
using (public.has_org_capability(organisation_id,'manage_finance'))
with check (public.has_org_capability(organisation_id,'manage_finance'));

drop policy if exists "engineer sees own location sessions" on public.engineer_location_sessions;
create policy "engineer or scheduling capability sees location sessions" on public.engineer_location_sessions for select
using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
  or exists(
    select 1 from public.engineers e
    where e.id=engineer_id
      and (public.has_org_capability(e.organisation_id,'view_team_schedule') or public.has_org_capability(e.organisation_id,'dispatch_jobs'))
  )
);

drop policy if exists "engineer sees own live location" on public.engineer_live_locations;
create policy "engineer or scheduling capability sees live location" on public.engineer_live_locations for select
using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
  or exists(
    select 1 from public.engineers e
    where e.id=engineer_id
      and (public.has_org_capability(e.organisation_id,'view_team_schedule') or public.has_org_capability(e.organisation_id,'dispatch_jobs'))
  )
);

drop policy if exists "education members manage learners" on public.learners;
create policy "learner capability manages learners" on public.learners for all
using (public.has_org_capability(education_organisation_id,'manage_learners'))
with check (public.has_org_capability(education_organisation_id,'manage_learners'));

drop policy if exists "provider managers manage opportunities" on public.employer_opportunities;
create policy "opportunity capability manages opportunities" on public.employer_opportunities for all
using (exists(select 1 from public.providers p where p.id=provider_id and public.has_org_capability(p.organisation_id,'manage_opportunities')))
with check (exists(select 1 from public.providers p where p.id=provider_id and public.has_org_capability(p.organisation_id,'manage_opportunities')));

drop policy if exists "engineer reads own calendar connections" on public.provider_calendar_connections;
create policy "engineer or scheduling capability reads calendar connections" on public.provider_calendar_connections for select
using (
  exists(select 1 from public.engineers e where e.id=engineer_id and e.user_id=auth.uid())
  or exists(
    select 1 from public.engineers e
    where e.id=engineer_id
      and (public.has_org_capability(e.organisation_id,'view_team_schedule') or public.has_org_capability(e.organisation_id,'dispatch_jobs'))
  )
);
