create policy "provider members see allocated jobs"
on public.jobs
for select
using (
  exists (
    select 1
    from public.providers p
    join public.organisation_members m on m.organisation_id=p.organisation_id
    where m.user_id=auth.uid()
      and (
        public.jobs.matched_provider_id=p.id
        or exists (
          select 1 from public.job_offers jo
          where jo.job_id=public.jobs.id and jo.provider_id=p.id
        )
      )
  )
);

create policy "provider applicant reads own application"
on public.provider_applications
for select
using (lower(email)=lower(coalesce(auth.jwt()->>'email','')));

create policy "business contact reads own enquiry"
on public.business_enquiries
for select
using (lower(email)=lower(coalesce(auth.jwt()->>'email','')));

create policy "academy contact reads own interest"
on public.academy_interest
for select
using (lower(email)=lower(coalesce(auth.jwt()->>'email','')));
