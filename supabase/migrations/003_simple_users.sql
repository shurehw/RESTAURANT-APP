/**
 * supabase/migrations/003_simple_users.sql
 * Simple users table (no Supabase Auth)
 */

-- Drop auth-based user_profiles if it exists
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS has_role(TEXT) CASCADE;
DROP FUNCTION IF EXISTS has_any_role(TEXT[]) CASCADE;

-- Create simple users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'readonly' CHECK (role IN ('owner', 'finance', 'ops', 'kitchen', 'readonly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Seed default admin user
INSERT INTO users (email, password_hash, full_name, role) VALUES
  ('admin@opsos.local', '$2a$10$rZJ5YXqKQvNhj6j8xGxJC.dKqN3pGfR5YsR3UQxQZ0xGLhJY6J6xW', 'Admin User', 'owner')
ON CONFLICT (email) DO NOTHING;

COMMENT ON TABLE users IS 'Simple user management without Supabase Auth';
