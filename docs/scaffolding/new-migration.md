# Scaffold: New Database Migration

> Template for adding a new Supabase migration. All tables must be org-scoped with RLS.

## File Location

```
supabase/migrations/{next_number}_{description}.sql
```

Current highest migration number: check `supabase/migrations/` and increment.

## Template: Standard Table

```sql
-- ============================================================
-- Migration: {description}
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS {table_name} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  venue_id UUID REFERENCES venues(id),

  -- domain columns here
  name TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_{table_name}_org
  ON {table_name}(org_id);
CREATE INDEX IF NOT EXISTS idx_{table_name}_venue
  ON {table_name}(venue_id);

-- 3. RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "{table_name}_org_isolation" ON {table_name}
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- 4. Updated_at trigger
CREATE TRIGGER set_{table_name}_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
```

## Template: Version-Controlled Settings (P0 Pattern)

```sql
CREATE TABLE IF NOT EXISTS {settings_name} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES {settings_name}(id),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,

  -- settings columns here
  config JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(org_id, version)
);

-- Active settings function
CREATE OR REPLACE FUNCTION get_active_{settings_name}(p_org_id UUID)
RETURNS {settings_name} AS $$
  SELECT * FROM {settings_name}
  WHERE org_id = p_org_id
    AND effective_until IS NULL
  ORDER BY version DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Point-in-time query
CREATE OR REPLACE FUNCTION get_{settings_name}_at(p_org_id UUID, p_timestamp TIMESTAMPTZ)
RETURNS {settings_name} AS $$
  SELECT * FROM {settings_name}
  WHERE org_id = p_org_id
    AND effective_from <= p_timestamp
    AND (effective_until IS NULL OR effective_until > p_timestamp)
  ORDER BY version DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;
```

## Checklist

- [ ] `org_id` column with NOT NULL constraint
- [ ] RLS policy enabled and created
- [ ] Indexes on `org_id` and `venue_id`
- [ ] `IF NOT EXISTS` for idempotency
- [ ] `updated_at` trigger if table has mutable rows
- [ ] Version control functions if settings table (P0 pattern)
