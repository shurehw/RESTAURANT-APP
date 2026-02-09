-- Creates a SECURITY DEFINER function to look up auth.users by email.
-- This is needed because the Supabase auth.admin.listUsers() API is broken
-- on this project ("Database error finding users"). This function provides
-- a direct, reliable alternative for the legacy cookie auth path.

CREATE OR REPLACE FUNCTION public.get_auth_uid_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(lookup_email) LIMIT 1;
$$;

-- Only service_role should call this (it's used server-side in resolveContext)
REVOKE ALL ON FUNCTION public.get_auth_uid_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_uid_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_uid_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_uid_by_email(text) TO service_role;
