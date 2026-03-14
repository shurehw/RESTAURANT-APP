# API & Code Conventions

> Patterns and conventions to follow when adding new features.

## API Route Structure

```
app/api/{domain}/{action}/route.ts
```

- Export named functions: `GET`, `POST`, `PUT`, `DELETE`
- Auth via `resolveContext()` → `{ orgId, venueId, userId }`
- Platform admin routes use `requirePlatformAdmin()`
- Rate limiting via `lib/api/guard.ts`
- Error responses use `lib/api-errors.ts`

## Database Access Pattern

```typescript
// 1. Import the Supabase server client
import { createClient } from '@/lib/supabase/server'

// 2. Create client per request
const supabase = await createClient()

// 3. Query with RLS (org scoping automatic)
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('org_id', orgId)
```

## Migration Conventions

- File: `supabase/migrations/{number}_{description}.sql`
- Numbers are sequential (currently at ~278)
- Always include RLS policies
- Always scope to `org_id`
- Use `IF NOT EXISTS` for idempotency
- Version-controlled settings follow P0 pattern

## Component Patterns

- Server Components by default
- Client Components only when interactivity needed (`'use client'`)
- Feature components in `components/{domain}/`
- Base UI in `components/ui/` (Shadcn)
- Path alias: `@/` maps to project root

## Polling / Cron Pattern

For time-sensitive polling (< 1 min precision):
1. Create API endpoint as target
2. Use external scheduler (QStash/cron-job.org) to call it
3. Auth via shared mechanism
4. Process per-venue with `Promise.allSettled()`
5. Apply business date logic

For less time-sensitive (hourly+):
- Vercel cron is acceptable

## Settings Pattern (P0)

When adding new configurable settings:
1. Create migration with version-controlled table
2. Add `get_active_*()` and `get_*_at()` SQL functions
3. Create TypeScript types and data access in `lib/database/`
4. Provide sensible defaults with fallback chain
5. Add admin UI in `app/(dashboard)/admin/`

## Import Boundaries

| Module | Can Import From | Cannot Import From |
|---|---|---|
| `lib/database/` | Supabase client, types | `components/`, `app/` |
| `lib/ai/` | `lib/database/`, types | `components/`, `app/api/` |
| `app/api/` | `lib/` | `components/` |
| `components/` | `lib/`, `hooks/` | `app/api/` |
