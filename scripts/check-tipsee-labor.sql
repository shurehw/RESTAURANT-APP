-- Query TipSee for labor-related tables
-- Run with: psql "postgresql://TIPSEE_USERNAME_REDACTED:TIPSEE_PASSWORD_REDACTED@TIPSEE_HOST_REDACTED:5432/postgres?sslmode=require" -f scripts/check-tipsee-labor.sql

-- Find labor-related tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND (
    table_name ILIKE '%labor%' OR
    table_name ILIKE '%shift%' OR
    table_name ILIKE '%punch%' OR
    table_name ILIKE '%time%' OR
    table_name ILIKE '%clock%' OR
    table_name ILIKE '%employee%' OR
    table_name ILIKE '%payroll%' OR
    table_name ILIKE '%schedule%' OR
    table_name ILIKE '%staff%' OR
    table_name ILIKE '%wage%' OR
    table_name ILIKE '%hour%'
  )
ORDER BY table_name;
