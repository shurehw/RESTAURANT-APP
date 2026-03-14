# CLAUDE.md — KevaOS Agent Context

> This file gives Claude (and any AI agent) the map it needs to work in this codebase.
> "Give the agent a map, not a 1,000-page instruction manual."

## What Is This Project?

**KevaOS** — an enforcement engine for restaurant operations.
Multi-venue, multi-POS restaurant management platform built on Next.js 16 + Supabase.

**One-Sentence Spine:**
> The rules are always on. The rails are fixed. Calibration is allowed. Escape is not.

## Architecture Docs

Read these before making significant changes:

- [docs/architecture/system-map.md](docs/architecture/system-map.md) — Directory structure, tech stack, dependency flow
- [docs/architecture/data-pipeline.md](docs/architecture/data-pipeline.md) — POS data flow, ETL, sales pace
- [docs/architecture/enforcement-engine.md](docs/architecture/enforcement-engine.md) — Comp policy, violations, attestation
- [docs/architecture/integrations.md](docs/architecture/integrations.md) — External systems (POS, cameras, R365, AI)
- [docs/domain/business-rules.md](docs/domain/business-rules.md) — Business date, beverage classification, scoping
- [docs/domain/api-conventions.md](docs/domain/api-conventions.md) — Route patterns, DB access, migrations

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Actions, Server Components)
- **Language**: TypeScript (strict)
- **UI**: React 19, Shadcn/ui, Tailwind CSS
- **Database**: Supabase (PostgreSQL 15+ with Row-Level Security)
- **AI**: Claude via Anthropic SDK
- **Path alias**: `@/` → project root

## Conventions

### Import Boundaries (ENFORCED)

```
lib/database/  → Supabase only, never components/ or app/
lib/ai/        → lib/database/ + types, never components/ or app/api/
app/api/       → lib/ only, never components/
components/    → lib/ + hooks/, never app/api/
```

### API Routes
- Path: `app/api/{domain}/{action}/route.ts`
- Auth: `resolveContext()` → `{ orgId, venueId, userId }`
- Platform admin: `requirePlatformAdmin()`

### Database
- All tables scoped to `org_id` (multi-tenant via RLS)
- Version-controlled settings use P0 pattern (immutable rows, version chain)
- `general_locations` PK is `uuid`, name is `location_name`

### Polling / Scheduling
- Time-sensitive (<1min): external scheduler (QStash) → API endpoint
- Less sensitive (hourly+): Vercel cron is fine
- Business date: before 5 AM = previous day

## Scaffolding Templates

When building new features, use these templates as starting points:

- [docs/scaffolding/new-api-route.md](docs/scaffolding/new-api-route.md) — API endpoint boilerplate
- [docs/scaffolding/new-migration.md](docs/scaffolding/new-migration.md) — Database migration (standard + P0)
- [docs/scaffolding/new-settings-feature.md](docs/scaffolding/new-settings-feature.md) — Full-stack settings feature
- [docs/scaffolding/new-polling-endpoint.md](docs/scaffolding/new-polling-endpoint.md) — Cron/polling endpoint

## Quality Checks

```bash
npm run check:boundaries  # Import boundary enforcement
npm run check:refs         # Stale doc reference detection
npm run check:all          # Run both
```

These run automatically on PRs via `.github/workflows/ci.yml`.

## Common Gotchas

- Simphony (Dallas): revenue center names are NULL — use `revenue_center_number = 2` for bar
- Both Upserve and Simphony deliver LIVE data during service (not batch)
- Camera vision: we own detection pipeline. UniFi provides snapshots only.
- `general_locations.uuid` is the PK, NOT `id`

## Language Rules

When describing the system externally:
- **NEVER**: "organizational autonomy", "their own rules", "fully adaptable"
- **ALWAYS**: "calibrated thresholds within fixed standards", "tunable rails, not optional rules"
