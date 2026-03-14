# Data Pipeline Architecture

> How POS data flows through KevaOS: ingestion, enrichment, and consumption.

## POS Sources

| POS System | Venues | Data Path | Tables |
|---|---|---|---|
| Upserve | Most LA venues | TipSee sync | `tipsee_checks`, `tipsee_check_items` |
| Simphony | Dallas (The Patio) | TipSee sync | `tipsee_simphony_sales` |
| Toast | New venues | Direct API | `toast_*` (via `lib/integrations/toast.ts`) |

## POS Type Detection

```
getPosTypeForLocations() → queries general_locations.pos_type
```

- `general_locations` schema: PK is `uuid` (not `id`), name is `location_name` (not `display_name`)
- Simphony: Revenue center names are NULL — use `revenue_center_number = 2` as bar proxy

## Data Flow

```
POS (Upserve/Simphony/Toast)
    ↓ near real-time sync
TipSee Data Warehouse
    ↓ lib/etl/tipsee-sync.ts
Supabase (tipsee_checks, tipsee_check_items, tipsee_simphony_sales)
    ↓ enrichment queries
venue_day_facts (nightly aggregation)
    ↓ consumption
Reports / Forecasts / Pace / Exceptions
```

## Live Polling (Sales Pace)

- **Frequency**: Every 5 minutes during service hours
- **Trigger**: External scheduler → `POST /api/sales/poll`
- **Query**: `fetchIntraDaySummary()` (Upserve) or `fetchSimphonyIntraDaySummary()` (Simphony)
- **Storage**: `sales_snapshots` table (running totals with avg_check, bev_pct)
- **Projection**: `computeProjectedEOD()` extrapolates from velocity + elapsed service hours
- **Status**: `computePaceStatus()` → on_pace / warning / critical

## Beverage Classification

Used consistently across nightly reports and sales pace:
```sql
LIKE '%bev%' OR '%wine%' OR '%beer%' OR '%spirit%' OR '%cocktail%' OR '%liquor%'
```

## Nightly Enrichment

1. `venue_day_facts` — aggregated daily metrics per venue
2. `food_bev_split` — food vs beverage breakdown
3. `comp_exceptions` — flagged comps via `fetchCompExceptions()`
4. AI narratives — closing narrative, comp review, server review

## Key Files

| File | Purpose |
|---|---|
| `lib/database/tipsee.ts` | POS data queries (checks, items, intra-day, comp exceptions) |
| `lib/database/sales-pace.ts` | Snapshot CRUD, forecast lookups, pace computation |
| `lib/etl/tipsee-sync.ts` | TipSee polling & sync |
| `lib/etl/demand-curves.ts` | Demand forecasting curve fitting |
| `app/api/sales/poll/route.ts` | External scheduler target for sales pace |
| `app/api/sales/pace/route.ts` | Dashboard API for pace data |
| `supabase/migrations/225_sales_pace.sql` | Sales snapshots schema |

## Confirmed Behaviors

- **Both Upserve and Simphony deliver LIVE data during service** (near real-time POS → TipSee sync)
- Dallas venue may show no data when closed — this is NOT a batch delay
- All date-sensitive queries use business date logic (before 5 AM → previous day)
