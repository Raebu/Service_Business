-- Issued invoice immutability and provider bookkeeping revenue account.
insert into public.finance_accounts(code,name,account_type,normal_direction)
values('provider_service_revenue','Provider service revenue','income','credit')
on conflict (code) do nothing;

create or replace function public.protect_issued_invoice()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.immutable_issued_at is not null then
    if new.organisation_id is distinct from old.organisation_id
      or new.job_id is distinct from old.job_id
      or new.customer_organisation_id is distinct from old.customer_organisation_id
      or new.invoice_number is distinct from old.invoice_number
      or new.document_type is distinct from old.document_type
      or new.related_invoice_id is distinct from old.related_invoice_id
      or new.issue_date is distinct from old.issue_date
      or new.tax_point is distinct from old.tax_point
      or new.currency is distinct from old.currency
      or new.net_pence is distinct from old.net_pence
      or new.vat_pence is distinct from old.vat_pence
      or new.gross_pence is distinct from old.gross_pence
      or new.vat_number is distinct from old.vat_number
      or new.customer_name is distinct from old.customer_name
      or new.customer_address is distinct from old.customer_address
      or new.customer_vat_number is distinct from old.customer_vat_number then
      raise exception 'issued invoice financial fields are immutable; create a credit note or replacement document';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_issued_invoice_trigger on public.invoices;
create trigger protect_issued_invoice_trigger before update on public.invoices for each row execute function public.protect_issued_invoice();

create or replace function public.protect_issued_invoice_lines()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_invoice_id uuid; v_issued timestamptz;
begin
  v_invoice_id:=coalesce(new.invoice_id,old.invoice_id);
  select immutable_issued_at into v_issued from public.invoices where id=v_invoice_id;
  if v_issued is not null then raise exception 'issued invoice lines are immutable'; end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists protect_issued_invoice_lines_update on public.invoice_lines;
drop trigger if exists protect_issued_invoice_lines_delete on public.invoice_lines;
create trigger protect_issued_invoice_lines_update before update on public.invoice_lines for each row execute function public.protect_issued_invoice_lines();
create trigger protect_issued_invoice_lines_delete before delete on public.invoice_lines for each row execute function public.protect_issued_invoice_lines();
