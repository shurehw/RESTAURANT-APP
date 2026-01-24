-- List ALL users (not just @hwoodgroup.com) to see what's actually in the database
-- This will help identify if Adam signed up with a different email or if signup failed

DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL users in auth.users (last 20):';
  RAISE NOTICE '========================================';
  
  FOR v_user IN 
    SELECT id, email, created_at 
    FROM auth.users 
    ORDER BY created_at DESC
    LIMIT 20
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
  RAISE NOTICE 'ALL users in custom users table (last 20):';
  RAISE NOTICE '========================================';
  
  v_count := 0;
  FOR v_user IN 
    SELECT id, email, created_at, full_name
    FROM users 
    ORDER BY created_at DESC
    LIMIT 20
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  %: % - % (ID: %, Created: %)', 
      v_count, 
      v_user.email, 
      COALESCE(v_user.full_name, 'No name'),
      v_user.id, 
      v_user.created_at;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '  (No users found in custom users table)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Searching for "adam" or "alan" in any email:';
  RAISE NOTICE '========================================';
  
  v_count := 0;
  FOR v_user IN 
    SELECT id, email, created_at 
    FROM auth.users 
    WHERE LOWER(email) LIKE '%adam%' OR LOWER(email) LIKE '%alan%'
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
    RAISE NOTICE '  (No users found with "adam" or "alan" in email)';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Diagnostic complete.';
  RAISE NOTICE '========================================';

END $$;
