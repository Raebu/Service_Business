-- Remove unnecessary SECURITY DEFINER exposure from the RLS capability helper.
-- Authenticated users may read the non-sensitive capability matrix, while
-- organisation_members RLS still limits membership rows to auth.uid().

revoke all on public.role_capabilities from anon,authenticated;
grant select on public.role_capabilities to authenticated;

drop policy if exists "authenticated reads capability matrix" on public.role_capabilities;
create policy "authenticated reads capability matrix"
on public.role_capabilities
for select
to authenticated
using (true);

create or replace function public.has_org_capability(p_organisation_id uuid,p_capability text)
returns boolean
language sql
stable
security invoker
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
