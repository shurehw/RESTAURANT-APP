-- Find Adam (broader search)
SELECT 
  id::text as user_id,
  email,
  created_at,
  last_sign_in_at
FROM auth.users 
WHERE LOWER(email) LIKE '%olson%' 
   OR LOWER(email) LIKE '%adam%'
   OR LOWER(email) LIKE '%hwoodgroup.com%'
ORDER BY created_at DESC;
