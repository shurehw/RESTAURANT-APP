-- Check what constraints exist on proforma_projects
SELECT 
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM 
    pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE 
    rel.relname = 'proforma_projects'
    AND nsp.nspname = 'public'
    AND con.contype = 'c';  -- 'c' is for CHECK constraints
