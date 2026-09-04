-- Prevent API clients from directly invoking internal SECURITY DEFINER helpers.
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.review_quality_trigger() from public,anon,authenticated;
revoke all on function public.respond_to_job_offer(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.respond_to_job_offer(uuid,uuid,text) to service_role;
