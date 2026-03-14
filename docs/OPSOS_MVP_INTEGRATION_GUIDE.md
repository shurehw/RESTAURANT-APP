# KevaOS MVP Integration Guide

**Date:** November 10, 2025
**Status:** Phase 1 Complete - Ready for Testing
**Team:** Jacob Shure (Founder), Harsh Aggerwal (Finance Lead), Matt Perasso (PM), Waseem Akhtar (Tech Lead)

---

## Overview

This document describes the complete integration of the KevaOS Intelligence Layer with the existing MVP invoice processing system. The system now provides:

1. **Invoice Processing** (MVP Core) - Upload → Parse → Map → Approve
2. **Recipe→Inventory→COGS** - Real-time cost tracking
3. **Labor→Sales Efficiency** - SPLH and labor cost %
4. **Real-Time P&L** - Sales, COGS, Labor, Prime Cost
5. **Exception-First Workflow** - Only surface items needing attention
6. **Cost Intelligence** - Automated price spike detection

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     KevaOS Platform                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Invoice    │  │   Inventory  │  │    Labor     │      │
│  │  Processing  │→ │   Tracking   │→ │  Management  │      │
│  │   (MVP)      │  │  (Perpetual) │  │  (Schedule)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                  ↓                   ↓             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Intelligence Layer (NEW)                     │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  • Recipe-Inventory Bridge (031)                     │  │
│  │  • Cost Spike Detection (036)                        │  │
│  │  • Labor Efficiency MViews (037)                     │  │
│  │  • Daily Performance P&L (038)                       │  │
│  │  • Variance & Exceptions (039)                       │  │
│  │  • Vendor Scorecard (040)                            │  │
│  │  • Exception Rules Engine (041)                      │  │
│  │  • Automated pg_cron Jobs (042)                      │  │
│  └──────────────────────────────────────────────────────┘  │
│         ↓                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Exception-First Dashboard                    │  │
│  │  • Daily Performance Card                             │  │
│  │  • Exceptions Panel                                   │  │
│  │  • Real-Time Alerts                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Migrations

### Migration 031: Recipe-Inventory Bridge
**Purpose:** Link recipes to inventory items for COGS calculation

**Tables Created:**
- `recipe_components` - Links recipes to inventory items with quantities
- `recipe_costs` - Historical snapshot of recipe costs

**Functions:**
- `calculate_recipe_cost(recipe_id, venue_id)` - Calculate total recipe cost

### Migration 032: Budgets & Alerts Foundation
**Purpose:** Daily budgets and alert system

**Tables Created:**
- `daily_budgets` - Target metrics by venue and date
- `alert_rules` - Configurable alert thresholds
- `alerts` - Generated alerts for review

**Functions:**
- `create_alert(...)` - Generate alert
- `acknowledge_alert(alert_id, user_id)` - Dismiss alert

### Migration 033: POS Schema Extensions
**Purpose:** Add COGS tracking to POS sales

**Columns Added:**
- `pos_sales.recipe_id` - Link to recipe
- `pos_sales.cogs` - Calculated cost of goods sold

### Migration 034: Item Pars and Costs
**Purpose:** Track par levels and cost history

**Tables Created:**
- `item_pars` - Min/max levels per venue per item
- `item_cost_history` - Historical cost data for variance detection

**Views:**
- `items_below_reorder` - Items needing reorder

### Migration 035: Inventory Deduction Trigger ⭐ CRITICAL
**Purpose:** Auto-deduct inventory and calculate COGS on POS sale

**Trigger:** `process_sale_inventory()`
- Fires on `INSERT` or `UPDATE` of `pos_sales` when `recipe_id` is set
- Deducts inventory for all recipe components
- Calculates and stamps COGS on sale record
- Creates negative inventory transactions

**This is the core of Recipe→Inventory→COGS integration**

### Migration 036: Cost Spike Detection
**Purpose:** Alert on price variance >2 standard deviations

**Trigger:** `detect_cost_spike()`
- Uses z-score analysis on 90-day cost history
- Fires on receipt_lines and invoice_lines inserts
- Creates alerts for significant price changes

### Migration 037: Labor Efficiency
**Purpose:** Hourly labor metrics (SPLH, labor cost %)

**Materialized Views:**
- `labor_efficiency_hourly` - Hourly aggregation
- `labor_efficiency_daily` - Daily aggregation

**Refresh:** Hourly during service (11am-11pm via pg_cron)

### Migration 038: Daily Performance
**Purpose:** Real-time daily P&L

**Materialized View:** `daily_performance`
- Sales, COGS, Labor, Prime Cost
- Refresh: Every 15 minutes during service

### Migration 039: Variance & Exceptions
**Purpose:** Exception-first reporting

**Views:**
- `daily_variance` - Actual vs budget with severity
- `operational_exceptions` - Only items needing attention

### Migration 040: Vendor Performance
**Purpose:** Vendor scorecard

**Materialized View:** `vendor_performance`
- On-time delivery rate
- Auto-approval rate
- Cost spike frequency
- Vendor score (0-100)

**Refresh:** Daily at 6am

### Migration 041: Exception Rules
**Purpose:** Configurable auto-approval logic

**Table:** `exception_rules`
- Field-based conditions (>, <, between, etc.)
- Actions: auto_approve, require_review, alert, block
- Priority-based rule matching

### Migration 042: pg_cron Jobs
**Purpose:** Automated materialized view refresh

**Jobs Created:**
- Hourly: `labor_efficiency` refresh (11am-11pm)
- Every 15 min: `daily_performance` refresh (11am-11pm)
- Daily 6am: `vendor_performance` refresh
- Weekly: Cleanup old alerts and cost history

### Migration 043: RLS Policies
**Purpose:** Row-level security for all new tables

**Policies:** Venue-based access control for all intelligence layer tables

---

## API Endpoints

### Performance Metrics

#### `GET /api/performance/daily/[venueId]/[date]`
Returns daily P&L performance with variance and alerts.

**Response:**
```json
{
  "success": true,
  "data": {
    "performance": {
      "gross_sales": 1250.00,
      "cogs_pct": 28.5,
      "labor_pct": 22.3,
      "prime_cost_pct": 50.8,
      "transaction_count": 45,
      "labor_hours": 32.5,
      "sales_per_labor_hour": 38.46
    },
    "variance": {
      "sales_variance": 250.00,
      "sales_status": "normal",
      "cogs_variance_pct": -1.5,
      "cogs_status": "normal",
      "labor_variance_pct": 2.3,
      "labor_status": "warning",
      "prime_cost_variance_pct": 0.8,
      "prime_cost_status": "normal"
    },
    "alerts": [
      {
        "id": "...",
        "alert_type": "labor_overage",
        "severity": "warning",
        "title": "Labor 2.3% over budget",
        "message": "..."
      }
    ],
    "hourly": [...]
  }
}
```

#### `GET /api/labor/efficiency/[venueId]/[date]`
Returns labor efficiency metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "daily": {
      "total_labor_hours": 32.5,
      "labor_cost": 580.00,
      "sales_per_labor_hour": 38.46,
      "labor_cost_pct": 22.3
    },
    "hourly": [...],
    "shifts": [...]
  }
}
```

### Exceptions

#### `GET /api/exceptions`
Returns exception-first view.

**Query Params:**
- `venue_id` (optional) - Filter by venue
- `severity` (optional) - Filter by severity (info, warning, critical)

**Response:**
```json
{
  "success": true,
  "data": {
    "exceptions": [
      {
        "exception_type": "labor_overage",
        "venue_id": "...",
        "venue_name": "Test Venue",
        "business_date": "2025-11-10",
        "severity": "critical",
        "title": "Labor 15% over budget",
        "description": "Labor cost: $650 (budget: $565). Variance: $85 (15.0%)",
        "metadata": {...}
      }
    ],
    "summary": {
      "total": 5,
      "critical": 1,
      "warning": 3,
      "info": 1,
      "byType": {
        "labor_overage": 1,
        "cogs_high": 2,
        "low_stock": 2
      }
    }
  }
}
```

### Alerts

#### `POST /api/alerts/acknowledge`
Acknowledge (dismiss) an alert.

**Request Body:**
```json
{
  "alert_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Alert acknowledged"
}
```

---

## UI Components

### DailyPerformanceCard
**Location:** `components/dashboard/DailyPerformanceCard.tsx`

**Usage:**
```tsx
import { DailyPerformanceCard } from '@/components/dashboard/DailyPerformanceCard';

<DailyPerformanceCard
  performance={performanceData}
  variance={varianceData}
  date="2025-11-10"
  venueName="Test Venue"
/>
```

**Features:**
- Sales, COGS%, Labor%, Prime Cost% with variance badges
- Color-coded status indicators (green/yellow/red)
- SPLH and avg ticket display
- Responsive grid layout

### ExceptionsPanel
**Location:** `components/dashboard/ExceptionsPanel.tsx`

**Usage:**
```tsx
import { ExceptionsPanel } from '@/components/dashboard/ExceptionsPanel';

<ExceptionsPanel venueId="optional-venue-id" />
```

**Features:**
- Real-time exception updates (refresh every 60s)
- Filter by severity (all, critical, warning, info)
- Dismissable exceptions
- Icon-coded exception types
- Summary counts

---

## How It Works: End-to-End Flow

### 1. Invoice Processing → Cost Tracking

```
Invoice Upload (MVP)
     ↓
Claude Sonnet OCR Parse
     ↓
Vendor/Item Mapping
     ↓
Create Invoice + Lines
     ↓
[TRIGGER] detect_cost_spike()
     ↓
Z-Score Analysis (>2σ?)
     ↓
Create Alert (if spike detected)
     ↓
Update item_cost_history
     ↓
Update inventory_balances.last_cost
```

### 2. POS Sale → Inventory Deduction → COGS

```
POS Sale Recorded (recipe_id set)
     ↓
[TRIGGER] process_sale_inventory()
     ↓
For each recipe component:
  - Deduct inventory (negative transaction)
  - Calculate component cost (qty × last_cost)
     ↓
Sum all component costs
     ↓
Stamp COGS on pos_sales record
     ↓
Update inventory_balances
```

### 3. Shift Assignment → Labor Tracking

```
Shift Assignment Created
     ↓
[pg_cron] Hourly refresh at :00
     ↓
labor_efficiency_hourly MView recalculated
     ↓
Join shift_assignments + pos_sales
     ↓
Calculate: labor_cost, SPLH, labor_cost_%
```

### 4. Daily P&L Calculation

```
[pg_cron] Every 15 minutes (11am-11pm)
     ↓
Refresh daily_performance MView
     ↓
Aggregate:
  - Sales (from pos_sales)
  - COGS (sum of pos_sales.cogs)
  - Labor (from labor_efficiency_daily)
  - Prime Cost = COGS + Labor
     ↓
Compare to daily_budgets
     ↓
Generate variance view
     ↓
If variance > threshold → Create alert
```

### 5. Exception Detection

```
operational_exceptions View (Real-time)
     ↓
Query all variance conditions:
  - labor_overage (labor > budget + 10%)
  - cogs_high (cogs > budget + 1.5%)
  - sales_low (sales < budget - 10%)
  - low_stock (qty < reorder_point)
  - pending_approval (invoice status = pending)
     ↓
Return only items needing attention
```

---

## Testing

### Run Database Tests

```bash
# All tests
npm run test:db

# Unit tests only
npm run test:db:unit

# Integration tests only
npm run test:db:integration

# Verbose mode
npm run test:db:verbose

# Seed test data
npm run test:db:seed
```

### Test Coverage

✅ Recipe cost calculation (8 tests)
✅ Alert creation and acknowledgment (12 tests)
✅ Inventory deduction trigger (9 tests) ⭐ CRITICAL
🔜 Cost spike detection (planned)
🔜 Materialized view refresh (planned)
🔜 Exception rules evaluation (planned)
🔜 Integration tests (planned)

---

## Deployment Checklist

### Phase 0: Data Foundation (Week 1)

- [ ] Start Docker Desktop
- [ ] Run migrations: `npx supabase db reset`
- [ ] Verify tables created: Check Supabase dashboard
- [ ] Seed recipe_components for top 50 menu items
- [ ] Set daily_budgets for next 30 days
- [ ] Configure item_pars for top 50 SKUs
- [ ] Enable triggers in LOG mode initially
- [ ] Run test suite: `npm run test:db`

### Phase 1: Core Integrations (Weeks 2-4)

- [ ] Deploy API routes to production
- [ ] Add DailyPerformanceCard to dashboard
- [ ] Add ExceptionsPanel to dashboard
- [ ] Enable process_sale_inventory() trigger
- [ ] Enable cost spike detection trigger
- [ ] Configure pg_cron jobs
- [ ] Test on pilot venue (1 venue for 72 hours)
- [ ] Monitor materialized view refresh performance
- [ ] Verify COGS calculations manually (spot check 20 sales)

### Phase 2: Rollout (Week 5+)

- [ ] Rollout to remaining H.wood venues
- [ ] Enable Slack/email notifications for critical alerts
- [ ] Train managers on exception-first workflow
- [ ] Configure exception rules per venue
- [ ] Monitor and tune alert thresholds
- [ ] Weekly performance review meetings

---

## Monitoring & Observability

### Key Metrics to Monitor

**Performance:**
- Materialized view refresh time (<2s target)
- API response times (<500ms p95)
- Trigger execution time (<100ms)

**Data Quality:**
- COGS calculation accuracy (compare to manual calculations)
- Recipe cost drift over time
- Missing recipe_id on POS sales (target <5%)

**Business Metrics:**
- Exception count per day (target trending down)
- Alert acknowledgment rate (target >90%)
- Auto-approval rate for invoices (target >90%)

### Observability Queries

```sql
-- Check MView refresh status
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Find missing recipe_ids on POS sales
SELECT COUNT(*), COUNT(recipe_id), (COUNT(recipe_id)::FLOAT / COUNT(*)) * 100 as pct
FROM pos_sales WHERE sale_timestamp > NOW() - INTERVAL '7 days';

-- Verify COGS calculation accuracy
SELECT ps.id, ps.amount, ps.cogs, ps.cogs / ps.amount * 100 as cogs_pct
FROM pos_sales ps
WHERE ps.recipe_id IS NOT NULL AND ps.sale_timestamp > NOW() - INTERVAL '1 day'
ORDER BY ps.sale_timestamp DESC LIMIT 20;

-- Check alert generation rate
SELECT DATE(created_at) as date, alert_type, COUNT(*)
FROM alerts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), alert_type
ORDER BY date DESC, COUNT(*) DESC;
```

---

## Rollback Plan

If issues arise:

1. **Disable triggers:**
   ```sql
   ALTER TABLE pos_sales DISABLE TRIGGER process_sale_inventory_trigger;
   ALTER TABLE receipt_lines DISABLE TRIGGER detect_cost_spike_trigger;
   ```

2. **Stop pg_cron jobs:**
   ```sql
   SELECT cron.unschedule('refresh-labor-efficiency-hourly');
   SELECT cron.unschedule('refresh-daily-performance-15min');
   SELECT cron.unschedule('refresh-vendor-performance-daily');
   ```

3. **Rollback migrations:**
   ```bash
   # Rollback to before intelligence layer
   npx supabase db reset --version 030
   ```

---

## Contact & Support

**Technical Issues:** Waseem Akhtar (Tech Lead)
**Business Logic:** Harsh Aggerwal (Finance Lead)
**Product Questions:** Jacob Shure (Founder)
**Project Management:** Matt Perasso (PM)

**Documentation:**
- Test Suite: `supabase/tests/README.md`
- API Routes: `app/api/*/route.ts`
- Migrations: `supabase/migrations/031-043_*.sql`

---

## Next Steps

1. ✅ Complete migrations and test suite
2. ✅ Build API endpoints
3. ✅ Create UI components
4. 🔜 Deploy to staging environment
5. 🔜 Seed real H.wood venue data
6. 🔜 Pilot test with 1 venue for 72 hours
7. 🔜 Collect manager feedback
8. 🔜 Tune alert thresholds
9. 🔜 Rollout to all venues
10. 🔜 Begin Phase 2: Forecasting & Scheduling

---

**Status:** Intelligence Layer MVP Complete ✅
**Ready For:** Staging Deployment & Pilot Testing
**Target Pilot Date:** Week of November 17, 2025
