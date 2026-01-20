/**
 * Migration 126: Add mbarot@hwoodgroup.com as admin
 * Run this after user signs up, or they can be invited via Supabase dashboard
 */

-- Update user metadata to admin role if user already exists
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
WHERE email = 'mbarot@hwoodgroup.com';

COMMENT ON COLUMN auth.users.raw_user_meta_data IS 'User metadata including role (admin, user, etc)';
