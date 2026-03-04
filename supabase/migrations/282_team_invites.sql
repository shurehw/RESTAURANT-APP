-- ============================================================================
-- 282: Team Invites + Expanded Roles
-- ============================================================================
-- Expands organization_users.role to match the nav role system (9 roles).
-- Adds organization_invites table for email-based user invitations.
-- ============================================================================

-- ── 1. Expand organization_users role constraint ──────────────────

ALTER TABLE organization_users
  DROP CONSTRAINT IF EXISTS organization_users_role_check;

ALTER TABLE organization_users
  ADD CONSTRAINT organization_users_role_check
  CHECK (role IN (
    'owner', 'director', 'gm', 'agm', 'manager',
    'exec_chef', 'sous_chef', 'readonly', 'pwa',
    'admin', 'viewer'
  ));

-- ── 2. Organization Invites ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN (
                      'owner', 'director', 'gm', 'agm', 'manager',
                      'exec_chef', 'sous_chef', 'readonly', 'pwa'
                    )),
  venue_ids         UUID[],
  token             TEXT NOT NULL UNIQUE,
  invited_by        UUID NOT NULL REFERENCES auth.users(id),
  expires_at        TIMESTAMPTZ NOT NULL,
  accepted_at       TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending invite per email per org
CREATE UNIQUE INDEX idx_org_invite_pending_unique
  ON organization_invites(organization_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Fast token lookup for accept-invite flow
CREATE INDEX idx_org_invites_token
  ON organization_invites(token)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_org_invites_org
  ON organization_invites(organization_id);

-- ── 3. RLS ────────────────────────────────────────────────────────

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON organization_invites
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "org_admins_can_manage_invites"
  ON organization_invites
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid()
      AND is_active = TRUE
      AND role IN ('owner', 'admin', 'director')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_users
    WHERE user_id = auth.uid()
      AND is_active = TRUE
      AND role IN ('owner', 'admin', 'director')
  ));
