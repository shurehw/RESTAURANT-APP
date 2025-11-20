-- Extend capex assumptions for lender fees

alter table proforma_capex_assumptions
  add column if not exists lender_fee_pct numeric(5,2) default 0,
  add column if not exists lender_fee_capitalize boolean default true;

comment on column proforma_capex_assumptions.lender_fee_pct is
  'Lender origination fee as % of debt principal';
comment on column proforma_capex_assumptions.lender_fee_capitalize is
  'If true, add fee to loan balance; if false, expense in month 1';
