/**
 * Migration 045: Add harsh@thebinyagroup.com as admin
 * Run this after user signs up, or manually invite them via Supabase dashboard
 */

-- Option 1: If user already exists in auth.users, update their metadata
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
WHERE email = 'harsh@thebinyagroup.com';

-- Option 2: If you want to manually create the user (uncomment if needed)
-- Note: This requires you to have the encrypted password or use Supabase dashboard to invite
/*
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'harsh@thebinyagroup.com',
  crypt('TEMPORARY_PASSWORD_CHANGE_ME', gen_salt('bf')), -- They should reset this
  NOW(),
  '{"role": "admin"}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE
SET raw_user_meta_data = jsonb_set(
  COALESCE(auth.users.raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
);
*/

COMMENT ON COLUMN auth.users.raw_user_meta_data IS 'User metadata including role (admin, user, etc)';
