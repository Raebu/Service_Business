create or replace function public.prevent_finance_mutation()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  raise exception 'finance_records_are_append_only';
end;
$$;
