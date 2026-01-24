-- Function to get auth user ID by email
-- This allows querying auth.users from the application

CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(user_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE LOWER(email) = LOWER(user_email) LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION get_auth_user_id_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_auth_user_id_by_email(TEXT) TO service_role;
