-- Add validation triggers and constraints for revenue center × service period system

-- 1. CRITICAL CONSTRAINT: Cannot have covers for inactive center × service
create or replace function validate_covers_only_for_active_centers()
returns trigger as $$
begin
  if new.covers_per_service > 0 then
    if not exists (
      select 1 from proforma_center_service_participation
      where revenue_center_id = new.revenue_center_id
        and service_period_id = new.service_period_id
        and is_active = true
    ) then
      raise exception 'Cannot assign covers to inactive center for this service period';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_active_center_covers
  before insert or update on proforma_service_period_covers
  for each row
  execute function validate_covers_only_for_active_centers();

-- 2. Lock service-level estimate when any center value is manually edited
create or replace function lock_service_estimate_on_manual_edit()
returns trigger as $$
begin
  if new.is_manually_edited = true and (old.is_manually_edited = false or old.is_manually_edited is null) then
    update proforma_revenue_service_periods
    set avg_covers_per_service = null
    where id = new.service_period_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger lock_on_edit
  after update on proforma_service_period_covers
  for each row
  when (new.is_manually_edited = true and (old.is_manually_edited = false or old.is_manually_edited is null))
  execute function lock_service_estimate_on_manual_edit();

-- 3. Auto-update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_participation_timestamp
  before update on proforma_center_service_participation
  for each row
  execute function update_updated_at_column();
