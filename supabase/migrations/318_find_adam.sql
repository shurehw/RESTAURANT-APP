-- Search for Adam with variations
SELECT 'auth.users' as source, id::text, email, created_at
FROM auth.users 
WHERE LOWER(email) LIKE '%olson%' OR LOWER(email) LIKE '%adam%'

UNION ALL

SELECT 'custom users' as source, id::text, email, created_at
FROM users 
WHERE LOWER(email) LIKE '%olson%' OR LOWER(email) LIKE '%adam%';
