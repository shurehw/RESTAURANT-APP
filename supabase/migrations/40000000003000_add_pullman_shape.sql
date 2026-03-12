-- Add pullman to venue_tables shape constraint
ALTER TABLE venue_tables DROP CONSTRAINT IF EXISTS venue_tables_shape_check;
ALTER TABLE venue_tables ADD CONSTRAINT venue_tables_shape_check
  CHECK (shape IN ('round', 'square', 'rectangle', 'bar_seat', 'booth', 'oval', 'half_circle', 'pullman'));
