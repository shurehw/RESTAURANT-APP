# Business Rules & Domain Logic

> Canonical reference for business rules that apply across the system.

## Business Date

- **Before 5:00 AM** → previous business day
- Used in: sales pace, nightly reports, forecasting, camera polling
- Implementation: All date-sensitive queries apply this rule

## Service Hours

- Defined per venue in settings tables
- Polling (sales pace, cameras) only active during configured hours
- Projection calculations use elapsed percentage of service window

## Beverage Classification

Standard classification used in nightly reports and sales pace:
```sql
category ILIKE '%bev%'
OR category ILIKE '%wine%'
OR category ILIKE '%beer%'
OR category ILIKE '%spirit%'
OR category ILIKE '%cocktail%'
OR category ILIKE '%liquor%'
```

## Comp Policy Defaults (h.wood Group SOPs)

| Rule | Threshold |
|---|---|
| High value comp | $200 |
| Server max comp | $50 |
| Daily budget warning | 2% of revenue |
| Daily budget critical | 3% of revenue |
| Approved reasons | 19 standardized reasons |

See [enforcement-engine.md](../architecture/enforcement-engine.md) for full enforcement flow.

## Sales Pace Status

| Status | Condition |
|---|---|
| `on_pace` | Projected EOD >= forecast target |
| `warning` | Projected EOD below warning threshold |
| `critical` | Projected EOD below critical threshold |

Projection: Extrapolates from current velocity based on % of service hours elapsed.

## Fiscal Calendar

- Uses 4-4-5 fiscal calendar
- Implementation: `lib/fiscal-calendar.ts`

## Multi-Tenant Scoping

- Every business entity scoped to `org_id`
- Venue-level overrides via `venue_id`
- RLS enforced at database level
- Platform admins bypass org scoping

## General Locations Schema

- Primary key: `uuid` (NOT `id`)
- Name field: `location_name` (NOT `display_name`)
- POS type: `pos_type` column (upserve, simphony, toast)

## Simphony-Specific Rules

- Revenue center names are NULL for Dallas
- Use `revenue_center_number = 2` as bar proxy
- Data comes through `tipsee_simphony_sales` table

## Caching

- Settings queries: 5-minute TTL cache
- Applied in: `lib/database/sales-pace.ts`, `lib/database/greeting-metrics.ts`, `lib/database/comp-settings.ts`

## Version Control (P0 Pattern)

Settings tables use immutable row versioning:
1. New version inserted (never update in place)
2. Version chain linked via `previous_version_id`
3. Effective dating determines active version
4. Full audit trail with user/timestamp
5. Supports point-in-time queries via `get_*_settings_at(timestamp)`
