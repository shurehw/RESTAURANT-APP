-- Extend scenarios table for preopening phase

alter table proforma_scenarios
  add column if not exists preopening_start_month date,
  add column if not exists opening_month date;

comment on column proforma_scenarios.preopening_start_month is
  'Start of preopening phase (e.g. 2024-01-01). Null = no preopening phase.';

comment on column proforma_scenarios.opening_month is
  'Grand opening date (e.g. 2025-01-01). Operating P&L starts here. If null, use start_month (legacy).';

-- Migration note: For existing scenarios, opening_month defaults to start_month
update proforma_scenarios
set opening_month = start_month
where opening_month is null;
