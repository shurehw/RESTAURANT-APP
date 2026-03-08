-- ============================================================================
-- 1010: Fix users table role CHECK constraint
-- ============================================================================
-- The users table role constraint was stuck on old values from migration 237.
-- This aligns it with the current role system used by organization_users
-- and the accept-invite flow.
-- ============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'owner', 'director', 'gm', 'agm', 'manager',
    'exec_chef', 'sous_chef', 'readonly', 'pwa',
    'onboarding',
    -- Legacy roles (for existing rows)
    'finance', 'ops', 'kitchen'
  ));
