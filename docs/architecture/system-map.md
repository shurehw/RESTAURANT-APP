# KevaOS System Map

> Quick-reference architecture map. For agents and engineers navigating the codebase.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Language | TypeScript (strict mode, ES2020 target) |
| UI | React 19, Shadcn/ui, Tailwind CSS |
| Database | Supabase (PostgreSQL 15+ with RLS) |
| Auth | Supabase Auth + middleware.ts |
| AI | Claude (Anthropic SDK) — Opus 4.6, Sonnet 4.5 |
| Charts | Recharts |
| PDF | pdf-lib, html2pdf.js |
| Monitoring | Sentry (client, server, edge configs) |
| Scheduling | External schedulers (QStash/cron-job.org), NOT Vercel cron |

## Directory Structure

```
app/                    # Next.js App Router
  (admin)/              # Platform admin routes
  (dashboard)/          # Main authenticated UI (largest)
  (pwa)/                # Mobile/PWA (Pulse)
  api/                  # API routes organized by domain
components/             # React UI components (150+)
  ui/                   # Shadcn base components
  admin/                # Admin config UI
  attestation/          # Attestation workflows
  pulse/                # Mobile dashboard
lib/                    # Core business logic
  database/             # Data access layer (Supabase queries)
  ai/                   # AI reviewers & narrators
  etl/                  # Data sync & polling
  enforcement/          # Violation state machine, intake policy
  feedback/             # Coaching & signal generation
  cv/                   # Computer vision pipeline
  integrations/         # External system clients
  chatbot/              # AI assistant tools
  auth/                 # Auth guards & context resolution
  api/                  # API middleware (rate limiting)
  monitoring/           # Sentry setup
supabase/
  migrations/           # 278 SQL migrations (schema evolution)
docs/                   # Architecture & domain docs
scripts/                # Ad-hoc scripts (not production)
```

## Dependency Flow (Enforced Convention)

```
Types → Config → Database → Service/AI → API Routes → UI Components
```

- `lib/database/` queries Supabase — never imports from `components/`
- `lib/ai/` consumes data from `lib/database/` — never from API routes
- `app/api/` imports from `lib/` — never from `components/`
- `components/` imports from `lib/` and `hooks/` — never from `app/api/`

## Multi-Tenant Architecture

- Every table scoped to `org_id` + optional `venue_id`
- Row-Level Security (RLS) enforces isolation at the database level
- Auth context resolved via `resolveContext()` → `{ orgId, venueId, userId }`
- Platform admins bypass org scoping via `platform_admins` table

## Key Patterns

| Pattern | Description | Example |
|---|---|---|
| P0 Version Control | Immutable rows with version chains | `comp_settings`, `operational_standards` |
| Settings Fallback | Defaults → Org → Venue overrides | Comp thresholds |
| External Polling | QStash/cron triggers API endpoints | Sales pace, camera vision |
| Business Date | Before 5 AM = previous business day | All date-sensitive queries |
| 5-min Cache TTL | Cached settings queries | `lib/database/sales-pace.ts`, `lib/database/greeting-metrics.ts` |

## See Also

- [data-pipeline.md](data-pipeline.md) — POS data flow, ETL, enrichment
- [enforcement-engine.md](enforcement-engine.md) — Comp policy, violations, attestation
- [integrations.md](integrations.md) — External system connections
- [../domain/business-rules.md](../domain/business-rules.md) — Business logic reference
