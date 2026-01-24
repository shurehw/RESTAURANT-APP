-- List all @hwoodgroup.com users to help identify Adam and Alan
-- This is a diagnostic query - it won't modify anything

DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All @hwoodgroup.com users in auth.users:';
  RAISE NOTICE '========================================';
  
  FOR v_user IN 
    SELECT id, email, created_at 
    FROM auth.users 
    WHERE LOWER(email) LIKE '%@hwoodgroup.com' 
    ORDER BY email
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  %: % (ID: %, Created: %)', 
      v_count, 
      v_user.email, 
      v_user.id, 
      v_user.created_at;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '  (No users found in auth.users)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All @hwoodgroup.com users in custom users table:';
  RAISE NOTICE '========================================';
  
  v_count := 0;
  FOR v_user IN 
    SELECT id, email, created_at 
    FROM users 
    WHERE LOWER(email) LIKE '%@hwoodgroup.com' 
    ORDER BY email
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  %: % (ID: %, Created: %)', 
      v_count, 
      v_user.email, 
      v_user.id, 
      v_user.created_at;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '  (No users found in custom users table)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Users linked to h.wood group organization:';
  RAISE NOTICE '========================================';
  
  v_count := 0;
  FOR v_user IN 
    SELECT 
      au.email,
      au.id as user_id,
      ou.role,
      ou.is_active,
      o.name as org_name
    FROM organization_users ou
    JOIN auth.users au ON au.id = ou.user_id
    JOIN organizations o ON o.id = ou.organization_id
    WHERE LOWER(au.email) LIKE '%@hwoodgroup.com'
      AND (o.slug = 'hwood-group' OR o.name LIKE '%h.wood%' OR o.name LIKE '%Hwood%')
    ORDER BY au.email
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  %: % (Role: %, Active: %, Org: %)', 
      v_count, 
      v_user.email, 
      v_user.role, 
      v_user.is_active, 
      v_user.org_name;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '  (No @hwoodgroup.com users linked to h.wood group)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Diagnostic complete.';
  RAISE NOTICE '========================================';

END $$;
