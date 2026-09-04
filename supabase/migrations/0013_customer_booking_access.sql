-- Opaque guest token permits a customer to view/pay only their own booking before account creation.
alter table public.jobs add column if not exists customer_access_token_hash text;
create unique index if not exists jobs_customer_access_token_hash_uidx on public.jobs(customer_access_token_hash) where customer_access_token_hash is not null;
revoke all on public.jobs from anon;
