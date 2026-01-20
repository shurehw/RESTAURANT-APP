-- Add pre-opening support to invoice and GL systems
-- This allows invoices to be flagged as pre-opening expenses and coded to PreOpening GL section

-- 1. Add PreOpening to GL account sections
alter table gl_accounts
  drop constraint if exists gl_accounts_section_check;

alter table gl_accounts
  add constraint gl_accounts_section_check
  check (section in (
    'Sales','COGS','Labor','Opex','BelowTheLine','Summary','PreOpening'
  ));

-- 2. Add is_preopening flag to invoices
alter table invoices
  add column if not exists is_preopening boolean not null default false;

create index if not exists idx_invoices_preopening
  on invoices (is_preopening, venue_id)
  where is_preopening = true;

comment on column invoices.is_preopening is
  'Flag indicating this invoice is for pre-opening expenses (before venue opens)';

-- 3. Add is_preopening flag to invoice_lines
alter table invoice_lines
  add column if not exists is_preopening boolean not null default false;

create index if not exists idx_invoice_lines_preopening
  on invoice_lines (is_preopening)
  where is_preopening = true;

comment on column invoice_lines.is_preopening is
  'Flag indicating this line item is a pre-opening expense';

-- 4. Function to auto-set invoice_line.is_preopening from invoice
create or replace function sync_invoice_line_preopening_flag()
returns trigger as $$
begin
  -- When invoice.is_preopening changes, update all its lines
  if (TG_OP = 'UPDATE' and OLD.is_preopening is distinct from NEW.is_preopening) then
    update invoice_lines
    set is_preopening = NEW.is_preopening
    where invoice_id = NEW.id;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists sync_invoice_preopening_to_lines on invoices;

create trigger sync_invoice_preopening_to_lines
  after update on invoices
  for each row
  when (OLD.is_preopening is distinct from NEW.is_preopening)
  execute function sync_invoice_line_preopening_flag();

-- 5. Function to set invoice_line.is_preopening on insert based on invoice
create or replace function set_invoice_line_preopening_on_insert()
returns trigger as $$
declare
  v_is_preopening boolean;
begin
  -- Get preopening status from parent invoice
  select is_preopening into v_is_preopening
  from invoices
  where id = NEW.invoice_id;

  NEW.is_preopening := coalesce(v_is_preopening, false);
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists set_invoice_line_preopening on invoice_lines;

create trigger set_invoice_line_preopening
  before insert on invoice_lines
  for each row
  execute function set_invoice_line_preopening_on_insert();

comment on table invoices is
  'Invoice header with OCR metadata, R365 export tracking, and pre-opening expense support';
