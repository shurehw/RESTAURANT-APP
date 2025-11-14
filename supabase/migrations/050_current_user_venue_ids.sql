/**
 * Migration 050: Current User Venue IDs View
 * Purpose: Canonical tenancy model for consistent RLS policies
 * This view provides the foundation for all RLS policies by returning
 * the set of venue_ids the current authenticated user has access to
 */

-- Create view that returns venue IDs for current authenticated user
CREATE OR REPLACE VIEW current_user_venue_ids AS
SELECT DISTINCT v.id as venue_id
FROM venues v
JOIN organization_users ou ON v.organization_id = ou.organization_id
WHERE ou.user_id = auth.uid();

-- Grant usage to authenticated users
GRANT SELECT ON current_user_venue_ids TO authenticated;

COMMENT ON VIEW current_user_venue_ids IS 'Returns venue IDs accessible to the currently authenticated user based on their organization membership';
