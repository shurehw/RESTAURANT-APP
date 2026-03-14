# Scaffold: New Settings Feature (Full Stack)

> End-to-end pattern for adding a new configurable settings feature.
> Settings are tunable rails within fixed standards — enforcement is non-negotiable.

## Files to Create

```
supabase/migrations/{N}_{feature}_settings.sql    # Database schema (P0 pattern)
lib/database/{feature}-settings.ts                 # TypeScript types + queries
app/api/{feature}/settings/route.ts                # GET/PUT API
app/(dashboard)/admin/{feature}-settings/page.tsx  # Admin UI
```

## Step 1: Migration (P0 Version Control)

See [new-migration.md](new-migration.md) — use the version-controlled settings template.

## Step 2: TypeScript Data Access

```typescript
// lib/database/{feature}-settings.ts

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────────────

export interface {Feature}Settings {
  id: string;
  org_id: string;
  version: number;
  // ... domain-specific settings
  created_at: string;
  created_by: string | null;
}

// ── Defaults ───────────────────────────────────────────────────────────

export const DEFAULT_{FEATURE}_SETTINGS: Omit<{Feature}Settings, 'id' | 'org_id' | 'version' | 'created_at' | 'created_by'> = {
  // sensible defaults here
};

// ── Queries ────────────────────────────────────────────────────────────

let cachedSettings: { data: {Feature}Settings | null; expiry: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getActive{Feature}Settings(orgId: string): Promise<{Feature}Settings | null> {
  if (cachedSettings && Date.now() < cachedSettings.expiry) {
    return cachedSettings.data;
  }

  const svc = getServiceClient();
  const { data } = await (svc as any)
    .rpc('get_active_{feature}_settings', { p_org_id: orgId });

  cachedSettings = { data: data || null, expiry: Date.now() + CACHE_TTL };
  return cachedSettings.data;
}

export async function update{Feature}Settings(
  orgId: string,
  userId: string,
  updates: Partial<{Feature}Settings>
): Promise<{Feature}Settings> {
  const svc = getServiceClient();

  // Get current version
  const current = await getActive{Feature}Settings(orgId);
  const newVersion = (current?.version || 0) + 1;

  // Close out current version
  if (current) {
    await (svc as any)
      .from('{feature}_settings')
      .update({ effective_until: new Date().toISOString() })
      .eq('id', current.id);
  }

  // Insert new version
  const { data, error } = await (svc as any)
    .from('{feature}_settings')
    .insert({
      org_id: orgId,
      version: newVersion,
      previous_version_id: current?.id || null,
      created_by: userId,
      ...updates,
    })
    .select()
    .single();

  if (error) throw error;

  // Invalidate cache
  cachedSettings = null;

  return data;
}
```

## Step 3: API Route

See [new-api-route.md](new-api-route.md) — GET returns active settings (with defaults fallback), PUT creates new version.

## Step 4: Admin UI

Client component in `app/(dashboard)/admin/{feature}-settings/page.tsx` with:
- Form for editing settings values
- Version history viewer
- Import/export (JSON)

## Checklist

- [ ] Migration with P0 version control pattern
- [ ] TypeScript types matching schema
- [ ] Default settings with sensible values
- [ ] 5-minute cache on read queries
- [ ] Version chain (close old, insert new) on writes
- [ ] Cache invalidation on writes
- [ ] API route with auth via `resolveContext()`
- [ ] Admin UI with version history
