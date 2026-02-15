/**
 * Update User Roles System
 * Migrate from old role values to new management job titles
 */

-- Drop old CHECK constraint
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Add new CHECK constraint with management roles
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef'));

-- Migrate existing roles to new system
UPDATE user_profiles SET role = 'owner' WHERE role IN ('owner');
UPDATE user_profiles SET role = 'manager' WHERE role IN ('ops', 'readonly');
UPDATE user_profiles SET role = 'exec_chef' WHERE role IN ('kitchen');
UPDATE user_profiles SET role = 'director' WHERE role IN ('finance');

-- Update default role
ALTER TABLE user_profiles ALTER COLUMN role SET DEFAULT 'manager';

-- Comment
COMMENT ON COLUMN user_profiles.role IS 'Management role: owner, director, gm, agm, manager, exec_chef, sous_chef';
