# KevaOS: Restaurant Back-Office Platform

Multi-venue hospitality back-office platform integrating Toast, Square, and Restaurant365 (R365). Built with **Next.js 14 (App Router)**, **Supabase** (Postgres + Auth + Storage), and **TypeScript**.

## 📋 Overview

**KevaOS** unifies operations across multiple restaurant concepts with different POS systems into a single canonical data model:

- **Invoice AP**: OCR ingestion → vendor/item mapping → approval workflow → R365 export
- **Item Master**: Unified SKU catalog (food, beverage, packaging) with vendor price tiers & lead times
- **Inventory**: Count sheets, variance analysis, shrink tracking
- **Recipes**: BOM with packaging, prep loss, labor minutes → plate cost rollup
- **Declining Budget**: Weekly budget tracking with daily spend aggregation
- **Margin Intelligence**: Cost spike alerts, floor/target/ceiling margin monitoring

### Key Features

- **Canonical POS Model**: Normalizes Toast + Square sales into unified `pos_sales` fact table
- **Multi-Venue RLS**: Row-level security scopes data by venue; Finance/Owner bypass
- **Materialized Views**: Nightly refresh of cost & recipe rollups via `pg_cron`
- **OCR Pipeline**: Vendor alias resolution, item mapping, confidence thresholds
- **R365 Integration**: CSV export with MD5 checksum for AP import

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js 18+** (recommend 20+)
- **Supabase CLI**: `npm install -g supabase`
- **Docker** (for local Supabase instance)

### 1. Clone & Install

```bash
git clone <your-repo>
cd keva
npm install
```

### 2. Start Local Supabase

```bash
supabase start
```

**Note the output**: API URL, anon key, service_role key. You'll need these for `.env.local`.

### 3. Apply Schema

The schema is in `supabase/migrations/001_initial_schema.sql`. Apply it:

```bash
supabase db reset
# This runs all migrations in supabase/migrations/
```

Or manually:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/migrations/001_initial_schema.sql
```

### 4. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase keys from step 2:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# POS credentials (optional for local dev; use test keys)
TOAST_API_KEY=test_key
TOAST_RESTAURANT_GUID=test_guid
SQUARE_ACCESS_TOKEN=test_token
SQUARE_LOCATION_ID=test_location
```

### 5. Seed Database

```bash
npm run seed
```

This loads sample data: venues, vendors, items, recipes, budgets.

### 6. Run Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🏗️ Architecture

### Data Flow (ASCII)

```
┌──────────────┬──────────────┐
│  Toast (POS) │ Square (POS) │
└──────┬───────┴──────┬───────┘
       │              │
       │ sales mix    │ sales mix
       ▼              ▼
    ┌──────────────────────────┐
    │  POS ETL Normalizer      │
    │ (Toast/Square → Canon.)  │
    └──────────┬───────────────┘
               │
               ▼
┌──────────────┴───────────────┐       ┌─────────────────┐
│  Supabase Postgres           │◄──────┤ Invoice OCR     │
│  • pos_sales (canonical)     │       │ (PDF → JSON)    │
│  • invoices, items, recipes  │       └─────────────────┘
│  • budgets, inventory        │
│  • Materialized Views        │──────► R365 CSV Export
│  • pg_cron jobs              │
└──────────────┬───────────────┘
               │
               ▼
    ┌──────────────────────────┐
    │  Next.js 14 App Router   │
    │  /invoices /items        │
    │  /inventory /recipes     │
    │  /budget /alerts         │
    └──────────────────────────┘
```

### ERD Summary

**Dimensions**: `venues`, `departments`, `vendors`, `items`, `vendor_items`, `item_cost_history`

**AP**: `invoices`, `invoice_lines`, `ap_approvals`, `ap_export_batches`

**Inventory**: `inventory_locations`, `inventory_counts`, `inventory_count_lines`

**Recipes/Menu**: `recipes`, `recipe_items`, `menu_items`, `menu_item_recipes`

**POS**: `pos_sales` (canonical), `pos_menu_map` (external ID → menu_items)

**Budgets**: `budgets`, `daily_spend_facts`

**Alerts**: `alert_events`

**Views**:
- `v_item_latest_cost` (MV)
- `v_recipe_cost_rollup` (MV)
- `v_inventory_expected_vs_actual`
- `v_declining_budget`
- `v_cost_spikes`

---

## 📂 Project Structure

```
keva/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx (dashboard)
│   ├── invoices/
│   │   ├── page.tsx (list)
│   │   ├── [id]/page.tsx (review)
│   │   └── upload/page.tsx
│   ├── items/
│   │   ├── page.tsx (master grid)
│   │   └── [id]/page.tsx (edit drawer)
│   ├── inventory/
│   │   ├── page.tsx (count sheets)
│   │   ├── count/page.tsx (mobile UI)
│   │   └── variance/page.tsx
│   ├── recipes/
│   │   ├── page.tsx (list)
│   │   └── [id]/page.tsx (editor + cost panel)
│   ├── budget/
│   │   └── page.tsx (declining budget chart)
│   ├── alerts/
│   │   └── page.tsx
│   └── api/
│       ├── budget/route.ts
│       ├── ocr/webhook/route.ts
│       └── r365/export/route.ts
├── components/
│   ├── ui/ (shadcn/ui primitives)
│   ├── invoices/
│   ├── items/
│   ├── inventory/
│   ├── recipes/
│   ├── budget/
│   └── alerts/
├── lib/
│   ├── supabase/
│   │   ├── client.ts (browser client)
│   │   └── server.ts (server client)
│   ├── ocr/
│   │   └── normalize.ts
│   ├── integrations/
│   │   ├── toast.ts
│   │   ├── square.ts
│   │   └── r365.ts
│   ├── actions/ (server actions)
│   └── utils.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── scripts/
│   └── seed.ts
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

---

## 🔐 Authentication & RBAC

### Roles

| Role       | Access                                                                 |
|------------|------------------------------------------------------------------------|
| **Owner**      | Full access across all venues; manage users & settings                |
| **Finance**    | All venues: invoices, budgets, AP export; read recipes/inventory      |
| **Ops**        | Own venue: inventory, items (non-financial), vendor catalogs          |
| **Kitchen**    | Own venue: recipes, count entry, read items/costs                     |
| **ReadOnly**   | Dashboard, reports, no writes                                         |

### RLS Policies

Row-level security enabled on:
- `invoices`, `invoice_lines`, `inventory_counts`, `menu_items`, `pos_sales`, `daily_spend_facts`, `budgets`, `alert_events`

**Example** (from schema):
```sql
CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::jsonb->>'app_role' IN ('owner', 'finance')
    OR (
      current_setting('request.jwt.claims', true)::jsonb->>'app_role' IN ('ops', 'kitchen')
      AND venue_id::text = current_setting('request.jwt.claims', true)::jsonb->>'venue_id'
    )
  );
```

**Note**: JWT claims must include `app_role` and `venue_id` (set via Supabase auth hooks or custom claims).

---

## 📊 Data Governance

### SKU Normalization

- **UOM**: Always lowercase: `ea`, `lb`, `oz`, `gal`, `case`
- **SKU format**: `CATEGORY-DESCRIPTOR-SIZE` (e.g., `CUP-PET-16OZ`, `ESPRESSO-001`)

### Vendor Aliases

- Use `vendors.normalized_name` (lowercase, no punctuation) for fuzzy matching
- OCR pipeline auto-resolves aliases via `normalizeVendorName()` helper
- Manual review required if OCR confidence < 0.70

### Invoice Retention

- **Storage**: `invoices/{venue_id}/{YYYY}/{MM}/{invoice_id}.pdf`
- **Retention**: 7 years (compliance)

### Cost History

- Every invoice line creates a row in `item_cost_history`
- Materialized view `v_item_latest_cost` refreshed nightly
- Cost spike alerts triggered if >10% increase vs 7-day rolling avg

---

## 🔄 POS Integration

### Toast Sync

```typescript
import { syncToastSales } from '@/lib/integrations/toast';

// Sync daily sales for a venue
await syncToastSales(
  '11111111-1111-1111-1111-111111111111', // Delilah LA
  '2025-11-08', // business_date
  supabase
);
```

**What it does**:
1. Fetches sales mix from Toast API (`/reporting/v1/reports/salesMix`)
2. Upserts `menu_items` (external_id = Toast GUID)
3. Inserts `pos_sales` (venue, date, menu_item, qty, revenue)

### Square Sync

```typescript
import { syncSquareSales } from '@/lib/integrations/square';

// Sync daily sales for Nice Guy LA
await syncSquareSales(
  '22222222-2222-2222-2222-222222222222',
  '2025-11-08',
  supabase
);
```

**What it does**:
1. Fetches orders from Square API (`/v2/orders/search`)
2. Aggregates line items by `catalogObjectId`
3. Upserts `menu_items`, inserts `pos_sales`

### Canonical Model

Both Toast and Square sync to the same schema:
- `menu_items`: `(venue_id, external_id, name, price)`
- `pos_sales`: `(venue_id, business_date, menu_item_id, qty, net_revenue)`

---

## 🧾 Invoice OCR Pipeline

### Flow

1. **Upload PDF** → Supabase Storage (`invoices/{venue_id}/{YYYY}/{MM}/`)
2. **OCR Service** (Google Document AI, AWS Textract, etc.) → raw JSON
3. **Normalize** via `lib/ocr/normalize.ts`:
   - Resolve vendor alias
   - Match line items to SKU catalog
   - Return warnings for low confidence
4. **Insert** into `invoices` + `invoice_lines`
5. **Review UI** flags low-confidence lines (< 0.70)
6. **Approve** → status = `approved`
7. **Export to R365** → CSV batch

### Confidence Thresholds

| Confidence | Action                                      |
|------------|---------------------------------------------|
| ≥ 0.90     | Auto-approve header                         |
| 0.70–0.89  | Flag for review (yellow highlight)          |
| < 0.70     | Mandatory manual review (red, disable approve) |

---

## 💰 Declining Budget

### Setup

1. Create a budget record:
```sql
INSERT INTO budgets (venue_id, department_id, period_start, period_days, initial_budget)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '<kitchen_dept_id>',
  '2025-11-03', -- Monday
  7, -- weekly
  15000.00
);
```

2. Post daily spend to `daily_spend_facts`:
```sql
INSERT INTO daily_spend_facts (venue_id, department_id, txn_date, total_spend, source)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '<kitchen_dept_id>',
  '2025-11-03',
  2200.00,
  'invoice'
);
```

3. Query the view:
```sql
SELECT * FROM v_declining_budget
WHERE venue_id = '...' AND department_id = '...' AND period_start = '2025-11-03';
```

### API Route

```bash
GET /api/budget?venue=<uuid>&dept=<uuid>&start=2025-11-03
```

Returns daily series: `[{ txn_date, cumulative_spend, remaining_budget }, ...]`

---

## 🔔 Alerts

### Cost Spikes

**Nightly `pg_cron` job** (3:15 AM UTC):

```sql
SELECT raise_cost_spike_alerts();
```

Detects items with cost increase >10% vs recent history → inserts into `alert_events`.

### Margin Violations

**Worker stub**: `workers/margin-alerts.ts`

Compares menu item price vs recipe cost:
- If margin < `floor_margin_pct` → high severity alert
- If margin > `ceiling_margin_pct` → investigate pricing

Run via Edge Function cron or scheduled task.

---

## 🚢 Deployment (Vercel + Supabase Cloud)

### 1. Supabase Project

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
3. Enable `pg_cron` extension:
   ```sql
   CREATE EXTENSION pg_cron;
   ```
4. Create storage buckets:
   - `opsos-invoices` (private)
   - `opsos-exports` (private)
5. Configure RLS policies for buckets (Finance/Owner read/write all)

### 2. Vercel Deployment

```bash
npm install -g vercel
vercel login
vercel link

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add TOAST_API_KEY
vercel env add TOAST_RESTAURANT_GUID
vercel env add SQUARE_ACCESS_TOKEN
vercel env add SQUARE_LOCATION_ID

# Deploy
vercel --prod
```

### 3. Verify Cron Jobs

In Supabase Dashboard → **Database** → **Cron Jobs**:
- `refresh-cost-views-nightly` (3:05 AM)
- `cost-spike-alerts-nightly` (3:15 AM)

---

## 🧪 Testing

### Seed Data

Run `npm run seed` to populate:
- 2 venues (Delilah LA, Nice Guy LA)
- 6 departments (3 per venue)
- 3 vendors (Sysco, Vollrath, US Foods)
- 10 items (espresso, milk, cups, pizza dough, etc.)
- 2 recipes (Iced Latte, Margherita Pizza)
- Sample budgets & daily spend

### Manual Tests

1. **Invoice flow**: Upload PDF → OCR → review → approve → export
2. **Inventory count**: Create count sheet → enter quantities → finalize → view variance
3. **Recipe cost**: Edit recipe → add items → view live plate cost panel
4. **Budget**: Select venue/dept/week → view declining chart → export CSV

---

## 📖 API Reference

### Server Actions

**File**: `lib/actions/invoices.ts`

```typescript
// Approve multiple invoices
await approveInvoices(['invoice-uuid-1', 'invoice-uuid-2']);

// Export to R365
await exportToR365();
```

**File**: `lib/actions/recipes.ts`

```typescript
// Refresh recipe costs (calls MV refresh)
await refreshRecipeCosts();
```

### API Routes

| Route                     | Method | Description                          |
|---------------------------|--------|--------------------------------------|
| `/api/budget`             | GET    | Declining budget series              |
| `/api/ocr/webhook`        | POST   | OCR service webhook (async)          |
| `/api/r365/export`        | POST   | Generate R365 AP export batch        |

### Database Functions

```sql
-- Refresh materialized views
SELECT refresh_cost_views();

-- Detect cost spikes
SELECT raise_cost_spike_alerts();

-- Generate R365 export (via integration lib, not SQL)
```

---

## 🛠️ Operations Checklist

### Daily

- [ ] Review OCR low-confidence invoices (`/invoices` → filter `status=draft`)
- [ ] Approve AP batch (multi-select → Approve)
- [ ] Check alerts (`/alerts`)

### Weekly

- [ ] Export to R365 (`/invoices` → Export to R365 button)
- [ ] Review margin alerts
- [ ] Update budgets for next week

### Monthly

- [ ] Reconcile POS sales vs inventory usage (`/inventory/variance`)
- [ ] Update vendor price tiers (`/items` → vendor catalog)
- [ ] Review cost trends & renegotiate contracts

---

## 🐛 Troubleshooting

### "Relation does not exist" error

**Solution**: Run migrations:
```bash
supabase db reset
```

### RLS denies access

**Solution**: Check JWT claims include `app_role` and `venue_id`. Use service-role key for admin operations.

### Materialized views out of date

**Solution**: Manually refresh:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY v_item_latest_cost;
REFRESH MATERIALIZED VIEW CONCURRENTLY v_recipe_cost_rollup;
```

### POS sync fails

**Solution**: Verify API credentials in `.env.local`. Check Toast/Square API status.

---

## 📞 Support

- **GitHub Issues**: [your-repo/issues](https://github.com/your-org/opsos/issues)
- **On-call**: Finance lead (weeks 1/3), Ops lead (weeks 2/4)
- **SLA**: 99.5% uptime (Vercel + Supabase)
- **RTO/RPO**: < 4 hours / < 1 hour (Supabase PITR enabled)

---

## 📜 License

Proprietary. © 2025 Your Hospitality Group.

---

## 🎯 Roadmap

### Phase 1 (Current)
- [x] Core schema & migrations
- [x] Invoice OCR pipeline
- [x] Item master & vendor catalogs
- [x] Recipes & plate costing
- [x] Declining budget
- [x] POS integration (Toast, Square)
- [ ] Full UI implementation (invoices, items, inventory, recipes, budget, alerts)

### Phase 2 (Q2 2025)
- [ ] Labor costing integration (punch data → recipe labor_minutes)
- [ ] Purchase order workflow (PO → receipt → AP matching)
- [ ] Waste tracking (prep loss actuals vs recipe assumptions)
- [ ] Advanced reporting (custom dashboards, scheduled exports)

### Phase 3 (Q3 2025)
- [ ] Predictive ordering (ML-based demand forecast)
- [ ] Supplier scorecards (on-time delivery, quality, price variance)
- [ ] Mobile app (native iOS/Android for count entry)
- [ ] Real-time alerts (WebSocket-based notifications)

---

**Built with ❤️ for multi-venue restaurant operations**
