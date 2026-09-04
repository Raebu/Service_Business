create or replace function public.refresh_provider_quality(p_provider_id uuid)
returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
  v_sum numeric;
  v_score numeric;
begin
  select count(*),coalesce(sum(rating),0) into v_count,v_sum
  from public.reviews where provider_id=p_provider_id;
  -- Bayesian average: five neutral-good 4-star reviews as the starting prior.
  v_score := round((((v_sum + 20)::numeric / (v_count + 5)) * 20)::numeric,2);
  update public.providers set quality_score=v_score,updated_at=now() where id=p_provider_id;
  return v_score;
end;
$$;

create or replace function public.review_quality_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.refresh_provider_quality(coalesce(new.provider_id,old.provider_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists reviews_refresh_provider_quality on public.reviews;
create trigger reviews_refresh_provider_quality
after insert or update of rating or delete on public.reviews
for each row execute procedure public.review_quality_trigger();

revoke all on function public.refresh_provider_quality(uuid) from public,anon,authenticated;
grant execute on function public.refresh_provider_quality(uuid) to service_role;
