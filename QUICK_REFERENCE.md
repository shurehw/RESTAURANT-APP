# OpsOS Quick Reference

## 🚀 Instant Commands

```bash
# Local development
npm install
supabase start
supabase db reset
cp .env.example .env.local
# (edit .env.local with Supabase keys)
npm run dev

# Production deployment
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel --prod
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/001_initial_schema.sql` | Complete database schema (800+ lines) |
| `lib/ocr/normalize.ts` | Invoice OCR normalization |
| `lib/integrations/toast.ts` | Toast POS sync |
| `lib/integrations/square.ts` | Square POS sync |
| `lib/integrations/r365.ts` | R365 AP export |
| `lib/actions/invoices.ts` | Server actions (approve, export) |
| `app/invoices/page.tsx` | Invoice list page |
| `app/budget/page.tsx` | Declining budget page |
| `components/budget/DecliningBudgetChart.tsx` | Budget chart |

## 🗄️ Database Quick Queries

```sql
-- List all tables
\dt

-- Check venues
SELECT * FROM venues;

-- Latest item costs
SELECT * FROM v_item_latest_cost LIMIT 10;

-- Recipe costs
SELECT * FROM v_recipe_cost_rollup;

-- Pending invoices
SELECT * FROM invoices WHERE status = 'pending_approval';

-- Refresh materialized views
SELECT refresh_cost_views();

-- Manually trigger cost spike alerts
SELECT raise_cost_spike_alerts();

-- Check cron jobs
SELECT * FROM cron.job;
```

## 🔑 Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Toast (Delilah LA)
TOAST_API_KEY=your_key
TOAST_RESTAURANT_GUID=your_guid

# Square (Nice Guy LA)
SQUARE_ACCESS_TOKEN=your_token
SQUARE_LOCATION_ID=your_location_id
```

## 📊 Seeded Data

After running `supabase db reset`, you get:

- **2 venues**: Delilah LA (Toast), Nice Guy LA (Square)
- **6 departments**: kitchen/bar/packaging × 2 venues
- **3 vendors**: Sysco, Vollrath, US Foods
- **10 items**: espresso, milk, ice, cups, lids, straws, pizza dough, sauce, cheese, boxes
- **2 recipes**: Iced Latte 16oz, Margherita Pizza 12in
- **Sample budgets**: Week starting 2025-11-03
- **Sample spend**: 5 days of transactions

## 🎯 User Flows

### Invoice Approval Flow

1. Finance uploads PDF at `/invoices/upload`
2. OCR service processes → normalized data
3. Review at `/invoices/[id]` (map items, fix confidence issues)
4. Approve → status = `approved`
5. Export to R365 → CSV in Storage, invoices marked `exported`

### Declining Budget Flow

1. Finance creates budget: `INSERT INTO budgets (...)`
2. Daily invoices post to `daily_spend_facts`
3. View at `/budget` → select venue/dept/week
4. Chart shows remaining budget declining
5. Export CSV for reporting

### Recipe Costing Flow

1. Kitchen creates recipe at `/recipes/new`
2. Add ingredients + packaging items
3. Set yield, prep loss %, labor minutes
4. View live plate cost (auto-calculated from `v_recipe_cost_rollup`)
5. Link to menu items via `menu_item_recipes`

## 🔧 Common Tasks

### Add a new vendor

```sql
INSERT INTO vendors (name, normalized_name, r365_vendor_id)
VALUES ('New Vendor LLC', 'new vendor llc', 'R365_NEWVENDOR');
```

### Add a new item

```sql
INSERT INTO items (sku, name, category, base_uom)
VALUES ('TOMATO-ROMA-LB', 'Roma Tomatoes (lb)', 'food', 'lb');
```

### Update item cost

```sql
INSERT INTO item_cost_history (item_id, effective_date, unit_cost, source)
VALUES (
  (SELECT id FROM items WHERE sku = 'ESPRESSO-001'),
  CURRENT_DATE,
  19.50,
  'manual'
);
```

### Create a budget

```sql
INSERT INTO budgets (venue_id, department_id, period_start, period_days, initial_budget)
VALUES (
  (SELECT id FROM venues WHERE name = 'Delilah LA'),
  (SELECT id FROM departments WHERE venue_id = (SELECT id FROM venues WHERE name = 'Delilah LA') AND name = 'kitchen'),
  '2025-11-10', -- next Monday
  7,
  16000.00
);
```

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| "relation does not exist" | Run `supabase db reset` |
| RLS denies access | Use service_role key for dev; check JWT claims for prod |
| Materialized views stale | `SELECT refresh_cost_views();` |
| pg_cron not running | Enable `pg_cron` extension; verify schedule |
| POS sync fails | Check API credentials; review rate limits |
| Next.js build fails | Run `npm install`; check TypeScript errors |

## 📖 Documentation Links

- **Full README**: [README.md](README.md)
- **Getting Started**: [GETTING_STARTED.md](GETTING_STARTED.md)
- **Implementation Status**: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Toast API**: https://doc.toasttab.com
- **Square API**: https://developer.squareup.com

## 🎨 UI Components

### Available

- `Button` - shadcn/ui button component
- Basic Tailwind styling

### TODO (install with `npx shadcn@latest add <component>`)

- `Table` - Data tables
- `Dialog` - Modals
- `Input` - Form inputs
- `Select` - Dropdowns
- `Checkbox` - Checkboxes
- `Tabs` - Tabbed interfaces

## 🔐 RBAC Roles

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, all venues |
| **Finance** | All venues: invoices, budgets, exports, reports |
| **Ops** | Own venue: inventory, items (read-only financials) |
| **Kitchen** | Own venue: recipes, counts, read items |
| **ReadOnly** | Reports, no writes |

## 📈 Key Metrics (Dashboard)

- Total invoices
- Pending approvals (requires action)
- Active alerts (unacknowledged)
- Remaining budget per venue
- Open inventory counts

## ⚡ Performance Notes

- Materialized views refresh **nightly at 3:05 AM UTC**
- Cost spike alerts run **nightly at 3:15 AM UTC**
- POS sync should run **daily at 2 AM** (manual setup required)
- Invoice OCR is **asynchronous** (webhook callback)

## 🎁 What You Get Out of the Box

✅ **Complete database schema** (30+ tables, views, functions)
✅ **POS integration stubs** (Toast + Square → canonical model)
✅ **Invoice OCR pipeline** (normalization, confidence scoring)
✅ **R365 export** (CSV generation, MD5 checksum)
✅ **Declining budget** (full implementation with chart)
✅ **Dashboard & invoice pages** (working UI)
✅ **Server actions** (approve, export)
✅ **Seed data** (2 venues, 10 items, 2 recipes)
✅ **Deployment guides** (Vercel + Supabase Cloud)

## 🚧 What's Left to Build

⬜ Invoice upload UI
⬜ Invoice review page
⬜ Item master grid
⬜ Inventory count pages
⬜ Recipe editor pages
⬜ Alerts page
⬜ Authentication (Supabase Auth)

**Estimated time to MVP**: 2-3 days (with the foundation in place)

---

**Questions? Check [GETTING_STARTED.md](GETTING_STARTED.md) or create a GitHub issue.**
