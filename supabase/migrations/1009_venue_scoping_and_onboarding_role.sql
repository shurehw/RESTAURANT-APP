-- ============================================================================
-- 1009: Per-User Venue Scoping + Onboarding Role
-- ============================================================================
-- Makes get_user_venue_ids() and current_user_venue_ids respect the
-- organization_users.venue_ids column. When venue_ids IS NULL, returns
-- all org venues (existing behavior). When venue_ids is a non-empty
-- array, returns only those specific venues.
--
-- Also adds 'onboarding' to the role CHECK constraints on
-- organization_users and organization_invites.
-- ============================================================================

-- ── 1. Fix get_user_venue_ids() to respect venue_ids column ─────────────────

CREATE OR REPLACE FUNCTION get_user_venue_ids()
RETURNS SETOF UUID AS $$
  SELECT v.id
  FROM venues v
  JOIN organization_users ou ON ou.organization_id = v.organization_id
  WHERE ou.user_id = auth.uid()
    AND ou.is_active = TRUE
    AND (
      ou.venue_ids IS NULL          -- NULL = all venues in org
      OR v.id = ANY(ou.venue_ids)   -- array = only listed venues
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 2. Fix current_user_venue_ids view to respect venue_ids column ──────────

CREATE OR REPLACE VIEW current_user_venue_ids AS
SELECT DISTINCT v.id AS venue_id
FROM venues v
JOIN organization_users ou ON v.organization_id = ou.organization_id
WHERE ou.user_id = auth.uid()
  AND ou.is_active = TRUE
  AND (
    ou.venue_ids IS NULL
    OR v.id = ANY(ou.venue_ids)
  );

-- Re-grant (CREATE OR REPLACE VIEW may reset grants)
GRANT SELECT ON current_user_venue_ids TO authenticated;

-- ── 3. Add 'onboarding' to organization_users role constraint ───────────────

ALTER TABLE organization_users
  DROP CONSTRAINT IF EXISTS organization_users_role_check;

ALTER TABLE organization_users
  ADD CONSTRAINT organization_users_role_check
  CHECK (role IN (
    'owner', 'director', 'gm', 'agm', 'manager',
    'exec_chef', 'sous_chef', 'readonly', 'pwa',
    'admin', 'viewer', 'onboarding'
  ));

-- ── 4. Add 'onboarding' to organization_invites role constraint ─────────────

ALTER TABLE organization_invites
  DROP CONSTRAINT IF EXISTS organization_invites_role_check;

ALTER TABLE organization_invites
  ADD CONSTRAINT organization_invites_role_check
  CHECK (role IN (
    'owner', 'director', 'gm', 'agm', 'manager',
    'exec_chef', 'sous_chef', 'readonly', 'pwa',
    'onboarding'
  ));
