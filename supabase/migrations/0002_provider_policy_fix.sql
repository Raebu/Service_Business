drop policy if exists "provider members see provider" on public.providers;

create policy "provider members see provider"
on public.providers
for select
using (
  exists (
    select 1
    from public.organisation_members m
    where m.organisation_id=public.providers.organisation_id
      and m.user_id=auth.uid()
  )
);
