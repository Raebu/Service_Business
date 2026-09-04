-- Finance, tax, VAT and MTD-ready recordkeeping foundation.

create table public.accounting_profiles (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  business_structure text not null default 'company' check (business_structure in ('company','sole_trader','partnership','other')),
  accounting_basis text not null default 'accrual' check (accounting_basis in ('accrual','cash')),
  vat_registered boolean not null default false,
  vat_number text,
  vat_scheme text not null default 'standard' check (vat_scheme in ('standard','cash_accounting','flat_rate','annual_accounting','not_registered')),
  financial_year_end_month smallint not null default 12 check (financial_year_end_month between 1 and 12),
  financial_year_end_day smallint not null default 31 check (financial_year_end_day between 1 and 31),
  mtd_vat_enabled boolean not null default false,
  mtd_income_tax_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((vat_registered and vat_number is not null) or not vat_registered)
);

create table public.finance_accounts (
  code text primary key,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense','tax')),
  normal_direction text not null check (normal_direction in ('debit','credit')),
  system_managed boolean not null default true,
  active boolean not null default true
);
insert into public.finance_accounts(code,name,account_type,normal_direction) values
  ('stripe_clearing','Stripe clearing','asset','debit'),
  ('bank','Bank','asset','debit'),
  ('accounts_receivable','Accounts receivable','asset','debit'),
  ('provider_payable','Provider payable','liability','credit'),
  ('vat_output','VAT output','tax','credit'),
  ('vat_input','VAT input','tax','debit'),
  ('platform_service_revenue','Platform service revenue','income','credit'),
  ('corporate_service_revenue','Corporate service revenue','income','credit'),
  ('stripe_processing_fees','Stripe processing fees','expense','debit'),
  ('refunds_and_credits','Refunds and credits','expense','debit'),
  ('materials_expense','Materials expense','expense','debit'),
  ('travel_expense','Travel expense','expense','debit'),
  ('other_expense','Other expense','expense','debit')
on conflict (code) do nothing;

alter table public.finance_journal_entries
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists tax_point date,
  add column if not exists accounting_period text,
  add column if not exists retention_until date;

alter table public.finance_journal_lines
  add column if not exists tax_code text,
  add column if not exists vat_rate numeric(6,3) check (vat_rate is null or vat_rate between 0 and 100),
  add column if not exists vat_amount_pence bigint check (vat_amount_pence is null or vat_amount_pence >= 0),
  add column if not exists gross_amount_pence bigint check (gross_amount_pence is null or gross_amount_pence > 0);

create table public.finance_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period_type text not null check (period_type in ('month','quarter','year','vat')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open','review','closed','locked')),
  reconciled_at timestamptz,
  closed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organisation_id,period_type,starts_on,ends_on),
  check (ends_on >= starts_on)
);

create table public.vat_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period_key text not null,
  starts_on date not null,
  ends_on date not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','ready','submitted','accepted','rejected','closed')),
  box_1_output_vat_pence bigint not null default 0,
  box_2_acquisitions_vat_pence bigint not null default 0,
  box_3_total_vat_pence bigint not null default 0,
  box_4_reclaimed_vat_pence bigint not null default 0,
  box_5_net_vat_pence bigint not null default 0,
  box_6_sales_net_pence bigint not null default 0,
  box_7_purchases_net_pence bigint not null default 0,
  box_8_eu_supplies_net_pence bigint not null default 0,
  box_9_eu_acquisitions_net_pence bigint not null default 0,
  calculated_at timestamptz,
  submitted_at timestamptz,
  hmrc_receipt_id text,
  created_at timestamptz not null default now(),
  unique(organisation_id,period_key),
  check (ends_on >= starts_on)
);

create table public.invoice_sequences (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  prefix text not null default 'INV',
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  customer_organisation_id uuid references public.organisations(id) on delete set null,
  invoice_number text not null,
  document_type text not null default 'invoice' check (document_type in ('invoice','credit_note')),
  related_invoice_id uuid references public.invoices(id) on delete set null,
  issue_date date not null default current_date,
  tax_point date not null default current_date,
  due_date date,
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  net_pence bigint not null check (net_pence >= 0),
  vat_pence bigint not null default 0 check (vat_pence >= 0),
  gross_pence bigint not null check (gross_pence >= 0),
  vat_number text,
  customer_name text not null,
  customer_address text,
  customer_vat_number text,
  status text not null default 'issued' check (status in ('draft','issued','paid','part_paid','cancelled','credited')),
  immutable_issued_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  retention_until date not null default (current_date + interval '6 years')::date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,invoice_number),
  check (gross_pence = net_pence + vat_pence)
);

create table public.invoice_lines (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_net_pence bigint not null check (unit_net_pence >= 0),
  net_pence bigint not null check (net_pence >= 0),
  vat_rate numeric(6,3) not null default 0 check (vat_rate between 0 and 100),
  vat_pence bigint not null default 0 check (vat_pence >= 0),
  gross_pence bigint not null check (gross_pence >= 0),
  tax_code text,
  unique(invoice_id,line_number),
  check (gross_pence = net_pence + vat_pence)
);

create table public.provider_expenses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  incurred_on date not null,
  category text not null,
  description text not null,
  supplier_name text,
  net_pence bigint not null check (net_pence >= 0),
  vat_pence bigint not null default 0 check (vat_pence >= 0),
  gross_pence bigint not null check (gross_pence >= 0),
  currency text not null default 'GBP',
  receipt_storage_path text,
  receipt_file_name text,
  tax_code text,
  status text not null default 'recorded' check (status in ('recorded','review','approved','rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (gross_pence = net_pence + vat_pence)
);

create table public.mileage_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  engineer_id uuid references public.engineers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  travelled_on date not null,
  purpose text not null,
  distance_miles numeric(10,2) not null check (distance_miles > 0),
  source text not null default 'manual' check (source in ('manual','job_route','import')),
  start_postcode text,
  end_postcode text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.finance_reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  source text not null,
  source_id text not null,
  exception_type text not null,
  expected_pence bigint,
  actual_pence bigint,
  currency text not null default 'GBP',
  status text not null default 'open' check (status in ('open','investigating','resolved','ignored')),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(source,source_id,exception_type)
);
create index finance_reconciliation_open_idx on public.finance_reconciliation_exceptions(status,detected_at) where status in ('open','investigating');

create table public.hmrc_submission_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  submission_type text not null check (submission_type in ('vat_return','income_tax_quarterly','income_tax_final')),
  period_key text not null,
  payload_hash text not null,
  status text not null default 'prepared' check (status in ('prepared','submitted','accepted','rejected')),
  hmrc_receipt_id text,
  submitted_at timestamptz,
  response_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organisation_id,submission_type,period_key,payload_hash)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-receipts','finance-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.allocate_invoice_number(p_organisation_id uuid,p_prefix text default 'INV')
returns text
language plpgsql
security definer set search_path=public
as $$
declare v_next bigint;v_prefix text;
begin
  insert into public.invoice_sequences(organisation_id,prefix,next_number)
  values(p_organisation_id,coalesce(nullif(trim(p_prefix),''),'INV'),1)
  on conflict (organisation_id) do nothing;
  select prefix,next_number into v_prefix,v_next from public.invoice_sequences where organisation_id=p_organisation_id for update;
  update public.invoice_sequences set next_number=v_next+1,updated_at=now() where organisation_id=p_organisation_id;
  return v_prefix||'-'||to_char(current_date,'YYYY')||'-'||lpad(v_next::text,6,'0');
end;
$$;
revoke all on function public.allocate_invoice_number(uuid,text) from public,anon,authenticated;
grant execute on function public.allocate_invoice_number(uuid,text) to service_role;

alter table public.accounting_profiles enable row level security;
alter table public.finance_accounts enable row level security;
alter table public.finance_periods enable row level security;
alter table public.vat_periods enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.provider_expenses enable row level security;
alter table public.mileage_records enable row level security;
alter table public.finance_reconciliation_exceptions enable row level security;
alter table public.hmrc_submission_records enable row level security;

create policy "members see accounting profile" on public.accounting_profiles for select using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "finance managers manage accounting profile" on public.accounting_profiles for all using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager'))) with check (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid() and m.role in ('owner','admin','manager')));
create policy "members see finance periods" on public.finance_periods for select using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "members see vat periods" on public.vat_periods for select using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "members see invoices" on public.invoices for select using (exists(select 1 from public.organisation_members m where (m.organisation_id=organisation_id or m.organisation_id=customer_organisation_id) and m.user_id=auth.uid()) or exists(select 1 from public.jobs j where j.id=job_id and j.customer_user_id=auth.uid()));
create policy "members see invoice lines" on public.invoice_lines for select using (exists(select 1 from public.invoices i join public.organisation_members m on (m.organisation_id=i.organisation_id or m.organisation_id=i.customer_organisation_id) where i.id=invoice_id and m.user_id=auth.uid()) or exists(select 1 from public.invoices i join public.jobs j on j.id=i.job_id where i.id=invoice_id and j.customer_user_id=auth.uid()));
create policy "provider members see expenses" on public.provider_expenses for select using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "provider members create expenses" on public.provider_expenses for insert with check (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "provider members see mileage" on public.mileage_records for select using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "provider members create mileage" on public.mileage_records for insert with check (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));
create policy "members see hmrc records" on public.hmrc_submission_records for select using (exists(select 1 from public.organisation_members m where m.organisation_id=organisation_id and m.user_id=auth.uid()));

revoke all on public.finance_accounts,public.invoice_sequences,public.finance_reconciliation_exceptions from anon,authenticated;
grant select on public.accounting_profiles,public.finance_periods,public.vat_periods,public.invoices,public.invoice_lines,public.provider_expenses,public.mileage_records,public.hmrc_submission_records to authenticated;
grant insert on public.provider_expenses,public.mileage_records to authenticated;
