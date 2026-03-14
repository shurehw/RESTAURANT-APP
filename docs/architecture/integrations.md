# External Integrations

> All external system connections, their purpose, and key implementation details.

## POS Systems

### Upserve (via TipSee)
- **Venues**: Most LA venues
- **Data**: Checks, check items, sales totals
- **Tables**: `tipsee_checks`, `tipsee_check_items`
- **Sync**: Near real-time during service via TipSee
- **File**: `lib/database/tipsee.ts`

### Oracle Simphony (via TipSee + BI)
- **Venues**: Dallas (The Patio)
- **Data**: Sales, revenue centers
- **Tables**: `tipsee_simphony_sales`
- **BI Queries**: `lib/integrations/simphony-bi.ts`
- **Tokens**: `lib/database/simphony-tokens.ts` (encrypted credentials)
- **Note**: Revenue center names NULL — use `revenue_center_number = 2` as bar proxy

### Toast
- **Venues**: New venue onboarding
- **Data**: Direct API integration
- **File**: `lib/integrations/toast.ts`
- **Config**: `supabase/migrations/276_toast_venue_config.sql`

### Square
- **File**: `lib/integrations/square.ts`
- **Status**: Integration available

## Camera / Computer Vision

### UniFi Protect
- **Purpose**: Camera snapshots for table greeting detection
- **Architecture**: We own the detection pipeline. UniFi provides snapshots only.
- **Client**: `lib/integrations/unifi-protect.ts` (Cloud Connector REST proxy)
- **Auth**: `UNIFI_PROTECT_API_KEY` env var
- **DO**: Pull snapshots via Cloud Connector (reliable)
- **DO NOT**: Rely on UniFi smart detection zone events (unreliable over cloud connector)

### Vision Pipeline (Our Own)
- **Detection**: Claude Vision analyzes snapshots with custom polygon zones
- **Tracking**: Zone state tracking, transition detection, metric correlation
- **Files**: `lib/cv/person-detector.ts`, `lib/cv/greeting-detector.ts`
- **Schema**: `supabase/migrations/224_camera_greeting_detection.sql`
- **Polling**: External scheduler → `GET /api/cv/poll`
- **Scene skip**: MD5 hash comparison avoids redundant Claude Vision calls

## ERP / Accounting

### Restaurant365 (R365)
- **Purpose**: GL account mapping, financial reporting
- **File**: `lib/integrations/r365.ts`
- **Docs**: `docs/R365_UOM_SETUP_GUIDE.md`
- **API**: `app/api/r365/`

## AI / LLM

### Anthropic (Claude)
- **Models**: Opus 4.6 (primary), Sonnet 4.5 (comp review default)
- **Uses**: Comp review, server review, closing narratives, weekly summaries, forecast explanations, signal extraction, chatbot, vision detection
- **Files**: `lib/ai/*.ts`
- **Config**: Per-org model/tokens/temperature via comp_settings

## Scheduling / Cron

### External Schedulers (QStash / cron-job.org)
- **Why**: Vercel cron minimum is 1 min and imprecise
- **Targets**: `/api/sales/poll`, `/api/cv/poll`
- **Auth**: Shared auth mechanism

### Vercel Cron
- **Used for**: Less time-sensitive jobs (review sync every 6h, nightly rollups)
- **Config**: `vercel.json`

## Email / Messaging

### Microsoft Graph
- **Purpose**: Email invoice sync
- **File**: `lib/microsoft-graph.ts`

## Monitoring

### Sentry
- **Config**: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- **File**: `lib/monitoring/sentry.ts`
- **Docs**: `docs/SENTRY_SETUP.md`

## Health Checks
- **File**: `lib/integrations/health-check.ts`
- **API**: `app/api/integrations/` — external system status monitoring
