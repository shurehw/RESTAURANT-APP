-- Remove the trigger that locks avg_covers_per_service when covers are manually edited
-- This allows re-allocation without the field being locked

drop trigger if exists lock_on_edit on proforma_service_period_covers;
drop function if exists lock_service_estimate_on_manual_edit();
