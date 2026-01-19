-- Add audit trail columns to proforma_service_period_covers

-- Add audit columns
alter table proforma_service_period_covers
  add column if not exists last_edited_by uuid references auth.users(id),
  add column if not exists edit_history jsonb default '[]'::jsonb,
  add column if not exists version integer not null default 1;

-- Track cover changes in edit history
create or replace function log_cover_change()
returns trigger as $$
begin
  new.edit_history = coalesce(new.edit_history, '[]'::jsonb) || jsonb_build_object(
    'timestamp', now(),
    'user_id', auth.uid(),
    'old_value', old.covers_per_service,
    'new_value', new.covers_per_service,
    'was_auto_allocated', not new.is_manually_edited
  );
  new.last_edited_by = auth.uid();
  new.last_edited_at = now();
  new.version = old.version + 1;
  return new;
end;
$$ language plpgsql;

create trigger track_cover_edits
  before update on proforma_service_period_covers
  for each row
  when (old.covers_per_service is distinct from new.covers_per_service)
  execute function log_cover_change();

-- Deprecate avg_covers_per_service column (make nullable)
alter table proforma_revenue_service_periods
  alter column avg_covers_per_service drop not null;

comment on column proforma_revenue_service_periods.avg_covers_per_service is
  'DEPRECATED: Use center-level covers in proforma_service_period_covers. This field is for backward compatibility only.';
