-- Security linter hardening for helper functions.
-- Fixes mutable search_path on the pure AutonomyOS domain mapper.

create or replace function public.autonomy_domain(p_kind text)
returns text
language sql
immutable
set search_path=public
as $$
select case
  when p_kind in ('dispatch','compliance','recovery_monitor','sla_monitor','competency_lifecycle') then 'operations'
  when p_kind='notifications' then 'communications'
  when p_kind in ('coverage_recruitment','growth_intelligence','growth_outreach') then 'growth'
  when p_kind in ('education_discovery','approved_calendar_booking','provider_nurture') then 'partnerships'
  when p_kind in ('reconciliation','finance_close','reserves') then 'finance'
  when p_kind in ('operational_kpis','quality_ranking','labour_demand','assurance') then 'assurance'
  else null end;
$$;

revoke all on function public.autonomy_domain(text) from public,anon,authenticated;
grant execute on function public.autonomy_domain(text) to service_role;
