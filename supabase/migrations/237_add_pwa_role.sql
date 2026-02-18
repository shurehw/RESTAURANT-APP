/**
 * Add PWA-only role
 * For users who only need Pulse live sales monitoring access
 */

-- Update users table CHECK constraint to include 'pwa'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'finance', 'ops', 'kitchen', 'readonly', 'pwa'));

-- Also update user_profiles if it exists (future-proof)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef', 'pwa'));
