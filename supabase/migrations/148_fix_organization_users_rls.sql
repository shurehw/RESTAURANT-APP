-- ============================================================================
-- FIX ORGANIZATION_USERS RLS CIRCULAR DEPENDENCY
-- 
-- PROBLEM: The existing policy "Users can view org memberships" has a circular
-- dependency - it requires querying organization_users to determine which
-- organization_users rows the user can see, which triggers RLS recursively.
--
-- SOLUTION: Add a policy that allows users to see their OWN membership rows
-- directly (user_id = auth.uid()) without any recursive organization check.
-- ============================================================================

-- 1. Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view org memberships" ON organization_users;

-- 2. Create a new policy that allows users to see their OWN memberships directly
-- This breaks the circular dependency by not requiring any subquery
CREATE POLICY "Users can view their own memberships"
  ON organization_users FOR SELECT
  USING (user_id = auth.uid());

-- 3. Add a separate policy for viewing OTHER members in orgs you belong to
-- This still uses the subquery but only for cross-member visibility
CREATE POLICY "Users can view members of their organization"
  ON organization_users FOR SELECT
  USING (
    organization_id IN (
      SELECT ou.organization_id 
      FROM organization_users ou
      WHERE ou.user_id = auth.uid() AND ou.is_active = true
    )
  );

-- Note: PostgreSQL RLS uses OR logic between multiple SELECT policies,
-- so users will be able to see:
-- 1. Their own membership row (via "Users can view their own memberships")
-- 2. Other members in their org (via "Users can view members of their organization")

-- ============================================================================
-- ALSO FIX THE ORGANIZATIONS TABLE POLICY (same circular issue)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;

-- Allow users to see organizations they're a member of
-- This query works because organization_users now has a non-recursive policy
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT ou.organization_id 
      FROM organization_users ou
      WHERE ou.user_id = auth.uid() AND ou.is_active = true
    )
  );

-- ============================================================================
-- VERIFICATION
-- Run this after the migration to confirm policies are correct:
-- ============================================================================
-- SELECT tablename, policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('organization_users', 'organizations')
-- ORDER BY tablename, policyname;
