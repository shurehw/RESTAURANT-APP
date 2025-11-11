# OpsOS Complete System Documentation

**Version:** 1.0.0
**Date:** November 10, 2025
**Status:** Intelligence Layer MVP Complete ✅
**Team:** Jacob Shure (Founder), Harsh Aggerwal (Finance Lead), Matt Perasso (PM), Waseem Akhtar (Tech Lead)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [Intelligence Layer](#intelligence-layer)
5. [API Reference](#api-reference)
6. [UI Components](#ui-components)
7. [Testing Infrastructure](#testing-infrastructure)
8. [Deployment Guide](#deployment-guide)
9. [Monitoring & Operations](#monitoring--operations)
10. [Troubleshooting](#troubleshooting)
11. [Future Roadmap](#future-roadmap)

---

## Executive Summary

### What is OpsOS?

OpsOS (Operations OS) is a restaurant operations management system designed to unify:
- **Invoice processing** + vendor item mapping
- **Inventory** + recipe costing
- **Forecasting** + labor scheduling
- **Real-time productivity monitoring**

### Key Features Delivered

✅ **Invoice Processing (MVP Core)**
- Upload PDFs/images via drag-and-drop
- Claude Sonnet API for OCR extraction
- Automatic vendor and item mapping
- Three-way match: PO → Receipt → Invoice
- Exception-based approval workflow

✅ **Recipe→Inventory→COGS Integration**
- Link recipes to inventory items
- Auto-deduct inventory on POS sales
- Real-time COGS calculation
- Recipe cost history tracking

✅ **Labor→Sales Efficiency**
- Hourly labor metrics (SPLH)
- Labor cost % vs budget
- Shift-level analysis
- Automated variance detection

✅ **Real-Time P&L Dashboard**
- Sales, COGS, Labor, Prime Cost
- Actual vs Budget variance tracking
- Refreshed every 15 minutes during service
- Exception-first reporting

✅ **Cost Intelligence**
- Automated price spike detection (z-score analysis)
- Vendor performance scorecard
- Cost trend tracking
- Historical cost comparison

✅ **Exception-First Workflow**
- Only surface items requiring attention
- Auto-approve 90% of operations
- Configurable exception rules
- Real-time alerts with acknowledgment

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 19, TypeScript |
| Backend | Next.js API Routes, Zod validation |
| Database | PostgreSQL (Supabase) |
| Storage | Supabase Storage |
| AI/OCR | Claude Sonnet 4.5 API |
| Auth | Supabase Auth (JWT) |
| Scheduling | pg_cron |
| Deployment | Vercel |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpsOS Platform                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Invoice    │  │   Inventory  │  │    Labor     │          │
│  │  Processing  │→ │   Tracking   │→ │  Management  │          │
│  │   (MVP)      │  │  (Perpetual) │  │  (Schedule)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         ↓                  ↓                   ↓                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          Intelligence Layer (Migrations 031-043)           │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  • Recipe-Inventory Bridge (031)                           │ │
│  │  • Budgets & Alerts Foundation (032)                       │ │
│  │  • POS Schema Extensions (033)                             │ │
│  │  • Item Pars & Cost History (034)                          │ │
│  │  • Inventory Deduction Trigger (035) ⭐ CRITICAL           │ │
│  │  • Cost Spike Detection (036)                              │ │
│  │  • Labor Efficiency MViews (037)                           │ │
│  │  • Daily Performance P&L (038)                             │ │
│  │  • Variance & Exceptions Views (039)                       │ │
│  │  • Vendor Performance Scorecard (040)                      │ │
│  │  • Exception Rules Engine (041)                            │ │
│  │  • Automated pg_cron Jobs (042)                            │ │
│  │  • Row-Level Security Policies (043)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│         ↓                                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          API Layer (Next.js API Routes)                    │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  • /api/performance/daily/[venueId]/[date]                │ │
│  │  • /api/labor/efficiency/[venueId]/[date]                 │ │
│  │  • /api/exceptions                                         │ │
│  │  • /api/alerts/acknowledge                                 │ │
│  │  • /api/invoices/ocr                                       │ │
│  │  • /api/invoices/[id]/auto-match                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│         ↓                                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │          UI Layer (React Components)                       │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │  • DailyPerformanceCard                                    │ │
│  │  • ExceptionsPanel                                         │ │
│  │  • Invoice Review Flow                                     │ │
│  │  • Labor Dashboard                                         │ │
│  │  • Inventory Management                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     1. Invoice Processing Flow                │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
            Upload PDF/Image (Supabase Storage)
                           │
                           ↓
            Claude Sonnet OCR Extraction
                           │
                           ↓
            Vendor/Item Mapping (normalize.ts)
                           │
                           ↓
            Create Invoice + Invoice Lines
                           │
                           ↓
            [TRIGGER] detect_cost_spike()
                           │
                           ↓
            Z-Score Analysis (>2σ?)
                           │
                   ┌───────┴───────┐
                   │               │
              Yes  │               │  No
                   ↓               ↓
           Create Alert    Update Cost History
                   │               │
                   └───────┬───────┘
                           │
                           ↓
            Update inventory_balances.last_cost
                           │
                           ↓
            Update item_cost_history

┌──────────────────────────────────────────────────────────────┐
│                  2. POS Sale → COGS Calculation               │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
            POS Sale Recorded (recipe_id set)
                           │
                           ↓
            [TRIGGER] process_sale_inventory()
                           │
                           ↓
            Loop: For each recipe_component
                           │
                   ┌───────┴───────┐
                   │               │
                   ↓               ↓
        Deduct Inventory    Calculate Cost
        (qty × sale_qty)    (qty × last_cost)
                   │               │
                   │               ↓
                   │      Accumulate Total COGS
                   │               │
                   └───────┬───────┘
                           │
                           ↓
            Create inventory_transaction (usage)
                           │
                           ↓
            Update inventory_balances.quantity_on_hand
                           │
                           ↓
            Stamp COGS on pos_sales record

┌──────────────────────────────────────────────────────────────┐
│                  3. Real-Time P&L Calculation                 │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
        [pg_cron] Every 15 minutes (11am-11pm)
                           │
                           ↓
        Refresh daily_performance MView
                           │
                   ┌───────┴───────┐
                   │               │
                   ↓               ↓
        Aggregate Sales     Aggregate Labor
        (from pos_sales)    (from shifts)
                   │               │
                   └───────┬───────┘
                           │
                           ↓
            Calculate Prime Cost = COGS + Labor
                           │
                           ↓
            Compare to daily_budgets
                           │
                           ↓
            Generate daily_variance view
                           │
                           ↓
            If variance > threshold → Create Alert
                           │
                           ↓
            Update operational_exceptions view

┌──────────────────────────────────────────────────────────────┐
│                  4. Exception Detection Flow                  │
└──────────────────────────────────────────────────────────────┘
                           │
                           ↓
        operational_exceptions View (Real-time)
                           │
                   ┌───────┴───────────────┐
                   │                       │
                   ↓                       ↓
        Labor Overage?           COGS High?
        (>10% over budget)       (>1.5% over budget)
                   │                       │
                   │       ┌───────────────┤
                   │       │               │
                   ↓       ↓               ↓
        Sales Low?  Low Stock?   Pending Approvals?
                   │       │               │
                   └───────┴───────┬───────┘
                                   │
                                   ↓
                    Combine All Exceptions
                                   │
                                   ↓
                    Return Only Items Needing Attention
                                   │
                                   ↓
                    Display in ExceptionsPanel
```

---

## Database Schema

### Core Tables (Existing)

```sql
-- Multi-tenant structure
organizations (id, name, created_at)
venues (id, name, organization_id, is_active)
users (id, email, created_at) -- Supabase Auth
user_venues (user_id, venue_id, role)

-- Vendor & Item Management
vendors (id, name, category, is_active)
items (id, name, sku, category, base_uom, is_active)

-- Purchasing
purchase_orders (id, venue_id, vendor_id, order_date, delivery_date, status, total_amount)
po_lines (id, po_id, item_id, quantity, unit_cost)

-- Receiving
receipts (id, venue_id, purchase_order_id, vendor_id, received_at, status)
receipt_lines (id, receipt_id, item_id, quantity, unit_cost)

-- Invoicing
invoices (id, venue_id, vendor_id, invoice_number, invoice_date, due_date,
          total_amount, status, auto_approved, match_confidence,
          variance_severity, image_url, ocr_raw_json)
invoice_lines (id, invoice_id, item_id, description, quantity, unit_cost, line_total)

-- Inventory
inventory_balances (venue_id, item_id, quantity_on_hand, last_cost, updated_at)
inventory_transactions (id, venue_id, item_id, transaction_type, quantity,
                       unit_cost, total_cost, reference_type, reference_id)

-- Labor
positions (id, name, hourly_rate)
shift_assignments (id, venue_id, user_id, position_id, shift_start, shift_end)

-- POS
pos_sales (id, venue_id, amount, sale_timestamp, item_name, quantity)

-- Recipes
recipes (id, name, venue_id, category, yield_quantity, yield_unit)
```

### Intelligence Layer Tables (NEW - Migrations 031-043)

#### Migration 031: Recipe-Inventory Bridge

```sql
CREATE TABLE recipe_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  cost_pct_of_dish NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_components_unique UNIQUE(recipe_id, item_id)
);

CREATE TABLE recipe_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  total_cost NUMERIC(12,4) NOT NULL,
  cost_per_serving NUMERIC(12,4),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  component_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Function to calculate recipe cost
CREATE OR REPLACE FUNCTION calculate_recipe_cost(
  p_recipe_id UUID,
  p_venue_id UUID DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_component_count INT := 0;
BEGIN
  SELECT
    COALESCE(SUM(rc.quantity * COALESCE(ib.last_cost, 0)), 0),
    COUNT(*)
  INTO v_total_cost, v_component_count
  FROM recipe_components rc
  LEFT JOIN inventory_balances ib ON rc.item_id = ib.item_id
    AND (p_venue_id IS NULL OR ib.venue_id = p_venue_id)
  WHERE rc.recipe_id = p_recipe_id;

  INSERT INTO recipe_costs (recipe_id, venue_id, total_cost, component_count)
  VALUES (p_recipe_id, p_venue_id, v_total_cost, v_component_count);

  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;
```

#### Migration 032: Budgets & Alerts Foundation

```sql
CREATE TABLE daily_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  sales_budget NUMERIC(12,2) NOT NULL CHECK (sales_budget >= 0),
  labor_budget NUMERIC(12,2) NOT NULL CHECK (labor_budget >= 0),
  cogs_budget_pct NUMERIC(5,2) NOT NULL CHECK (cogs_budget_pct >= 0 AND cogs_budget_pct <= 100),
  prime_cost_budget_pct NUMERIC(5,2) NOT NULL CHECK (prime_cost_budget_pct >= 0 AND prime_cost_budget_pct <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_budgets_unique UNIQUE(venue_id, business_date)
);

CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('variance', 'threshold', 'anomaly', 'stock', 'approval')),
  metric TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('>', '<', '>=', '<=', '=', '!=')),
  threshold_value NUMERIC(12,4),
  threshold_pct NUMERIC(5,2),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  is_active BOOLEAN NOT NULL DEFAULT true,
  apply_to_venues UUID[],
  notification_channels TEXT[] DEFAULT ARRAY['in_app'],
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'labor_overage', 'cogs_high', 'sales_low', 'cost_spike',
    'low_stock', 'pending_approval', 'variance_critical', 'anomaly_detected'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Functions for alert management
CREATE OR REPLACE FUNCTION create_alert(
  p_venue_id UUID,
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_alert_rule_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO alerts (venue_id, alert_rule_id, alert_type, severity, title, message, metadata)
  VALUES (p_venue_id, p_alert_rule_id, p_alert_type, p_severity, p_title, p_message, p_metadata)
  RETURNING id INTO v_alert_id;
  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION acknowledge_alert(
  p_alert_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE alerts
  SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = p_user_id
  WHERE id = p_alert_id AND acknowledged = false;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

#### Migration 033: POS Schema Extensions

```sql
-- Add recipe_id and cogs to pos_sales
ALTER TABLE pos_sales
ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

ALTER TABLE pos_sales
ADD COLUMN IF NOT EXISTS cogs NUMERIC(12,4);

CREATE INDEX IF NOT EXISTS idx_pos_sales_recipe_id ON pos_sales(recipe_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_venue_date ON pos_sales(venue_id, sale_timestamp::DATE);
```

#### Migration 034: Item Pars & Cost History

```sql
CREATE TABLE item_pars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  par_level NUMERIC(12,3) NOT NULL CHECK (par_level >= 0),
  reorder_point NUMERIC(12,3) NOT NULL CHECK (reorder_point >= 0),
  reorder_quantity NUMERIC(12,3) CHECK (reorder_quantity >= 0),
  max_level NUMERIC(12,3) CHECK (max_level >= par_level),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT item_pars_unique UNIQUE(venue_id, item_id)
);

CREATE TABLE item_cost_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  cost NUMERIC(12,4) NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT CHECK (source IN ('receipt', 'invoice', 'manual', 'import')),
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- View for items below reorder point
CREATE OR REPLACE VIEW items_below_reorder AS
SELECT
  ip.venue_id,
  ip.item_id,
  i.name as item_name,
  i.sku,
  ib.quantity_on_hand,
  ip.reorder_point,
  ip.reorder_quantity,
  ip.par_level,
  ib.last_cost,
  (ip.reorder_quantity * COALESCE(ib.last_cost, 0)) as estimated_order_cost,
  v.name as venue_name
FROM item_pars ip
JOIN items i ON ip.item_id = i.id
LEFT JOIN inventory_balances ib ON ip.item_id = ib.item_id AND ip.venue_id = ib.venue_id
JOIN venues v ON ip.venue_id = v.id
WHERE ib.quantity_on_hand < ip.reorder_point
  AND i.is_active = true
  AND v.is_active = true
ORDER BY (ip.reorder_point - ib.quantity_on_hand) DESC;
```

#### Migration 035: Inventory Deduction Trigger ⭐ CRITICAL

```sql
-- This is the CORE of Recipe→Inventory→COGS integration
CREATE OR REPLACE FUNCTION process_sale_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_component_record RECORD;
  v_recipe_cost NUMERIC := 0;
  v_component_cost NUMERIC := 0;
  v_deduction_qty NUMERIC;
BEGIN
  IF NEW.recipe_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Loop through all recipe components
  FOR v_component_record IN
    SELECT
      rc.item_id,
      rc.quantity as component_qty,
      rc.unit,
      ib.last_cost,
      ib.quantity_on_hand,
      i.name as item_name
    FROM recipe_components rc
    JOIN items i ON rc.item_id = i.id
    LEFT JOIN inventory_balances ib ON rc.item_id = ib.item_id
      AND ib.venue_id = NEW.venue_id
    WHERE rc.recipe_id = NEW.recipe_id
  LOOP
    -- Calculate deduction quantity
    v_deduction_qty := v_component_record.component_qty * COALESCE(NEW.quantity, 1);

    -- Calculate component cost
    v_component_cost := v_deduction_qty * COALESCE(v_component_record.last_cost, 0);
    v_recipe_cost := v_recipe_cost + v_component_cost;

    -- Insert negative inventory transaction
    INSERT INTO inventory_transactions (
      venue_id, item_id, transaction_type, quantity, unit_cost, total_cost,
      reference_type, reference_id, notes, transaction_date
    ) VALUES (
      NEW.venue_id, v_component_record.item_id, 'usage', -v_deduction_qty,
      v_component_record.last_cost, -v_component_cost, 'pos_sale', NEW.id,
      'Auto-deducted from sale: ' || COALESCE(NEW.item_name, 'Unknown Item'),
      COALESCE(NEW.sale_timestamp, NOW())
    );

    -- Update inventory balance
    UPDATE inventory_balances
    SET quantity_on_hand = quantity_on_hand - v_deduction_qty, updated_at = NOW()
    WHERE item_id = v_component_record.item_id AND venue_id = NEW.venue_id;

    -- Insert if doesn't exist (defensive)
    INSERT INTO inventory_balances (venue_id, item_id, quantity_on_hand, last_cost)
    SELECT NEW.venue_id, v_component_record.item_id, -v_deduction_qty, v_component_record.last_cost
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory_balances
      WHERE venue_id = NEW.venue_id AND item_id = v_component_record.item_id
    );
  END LOOP;

  -- Stamp COGS on sale
  UPDATE pos_sales SET cogs = v_recipe_cost WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert
CREATE TRIGGER process_sale_inventory_trigger
  AFTER INSERT ON pos_sales
  FOR EACH ROW
  WHEN (NEW.recipe_id IS NOT NULL)
  EXECUTE FUNCTION process_sale_inventory();

-- Trigger on update (if recipe_id changes)
CREATE TRIGGER process_sale_inventory_update_trigger
  AFTER UPDATE OF recipe_id ON pos_sales
  FOR EACH ROW
  WHEN (NEW.recipe_id IS NOT NULL AND (OLD.recipe_id IS NULL OR OLD.recipe_id != NEW.recipe_id))
  EXECUTE FUNCTION process_sale_inventory();
```

#### Migration 036: Cost Spike Detection

```sql
-- Detect price variance >2 standard deviations using z-score
CREATE OR REPLACE FUNCTION detect_cost_spike()
RETURNS TRIGGER AS $$
DECLARE
  v_historical_avg NUMERIC;
  v_std_dev NUMERIC;
  v_z_score NUMERIC;
  v_variance_pct NUMERIC;
  v_vendor_name TEXT;
  v_item_name TEXT;
  v_venue_id UUID;
BEGIN
  IF NEW.unit_cost IS NULL OR NEW.unit_cost = 0 THEN
    RETURN NEW;
  END IF;

  -- Get venue and vendor info
  SELECT r.venue_id, v.name INTO v_venue_id, v_vendor_name
  FROM receipts r
  JOIN vendors v ON r.vendor_id = v.id
  WHERE r.id = NEW.receipt_id;

  SELECT name INTO v_item_name FROM items WHERE id = NEW.item_id;

  -- Calculate 90-day historical stats
  SELECT AVG(rl.unit_cost), STDDEV(rl.unit_cost)
  INTO v_historical_avg, v_std_dev
  FROM receipt_lines rl
  JOIN receipts r ON rl.receipt_id = r.id
  WHERE rl.item_id = NEW.item_id
    AND rl.unit_cost IS NOT NULL
    AND rl.unit_cost > 0
    AND rl.created_at > NOW() - INTERVAL '90 days'
    AND rl.id != NEW.id;

  -- Need at least 5 historical records
  IF v_historical_avg IS NULL OR v_std_dev IS NULL OR v_std_dev = 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate z-score
  v_z_score := (NEW.unit_cost - v_historical_avg) / v_std_dev;
  v_variance_pct := ((NEW.unit_cost - v_historical_avg) / v_historical_avg) * 100;

  -- Alert if z-score > 2
  IF ABS(v_z_score) > 2 THEN
    PERFORM create_alert(
      v_venue_id,
      'cost_spike',
      CASE WHEN ABS(v_z_score) > 3 THEN 'critical' WHEN ABS(v_z_score) > 2.5 THEN 'warning' ELSE 'info' END,
      CASE WHEN v_z_score > 0 THEN 'Cost Spike Detected: ' || v_item_name ELSE 'Cost Drop Detected: ' || v_item_name END,
      format('%s from %s: $%s (was $%s avg). Variance: %s%%, Z-score: %s',
        v_item_name, v_vendor_name, ROUND(NEW.unit_cost, 2), ROUND(v_historical_avg, 2),
        ROUND(v_variance_pct, 1), ROUND(v_z_score, 2)),
      jsonb_build_object(
        'receipt_line_id', NEW.id, 'item_id', NEW.item_id, 'vendor_name', v_vendor_name,
        'new_cost', NEW.unit_cost, 'avg_cost', v_historical_avg, 'std_dev', v_std_dev,
        'z_score', v_z_score, 'variance_pct', v_variance_pct
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER detect_cost_spike_trigger
  AFTER INSERT OR UPDATE OF unit_cost ON receipt_lines
  FOR EACH ROW
  WHEN (NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0)
  EXECUTE FUNCTION detect_cost_spike();
```

#### Migration 037: Labor Efficiency Materialized Views

```sql
-- Hourly labor metrics
CREATE MATERIALIZED VIEW labor_efficiency_hourly AS
SELECT
  DATE_TRUNC('hour', sa.shift_start)::TIMESTAMPTZ as hour,
  sa.venue_id,
  v.name as venue_name,
  COUNT(DISTINCT sa.id) as shift_count,
  SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) as total_labor_hours,
  SUM((EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate) as labor_cost,
  COALESCE(SUM(ps.amount), 0) as revenue,
  CASE WHEN SUM(ps.amount) > 0 THEN
    (SUM((EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate) / SUM(ps.amount)) * 100
  ELSE NULL END as labor_cost_pct,
  CASE WHEN SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) > 0 THEN
    SUM(ps.amount) / SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600)
  ELSE NULL END as sales_per_labor_hour,
  COUNT(DISTINCT ps.id) as transaction_count,
  MAX(sa.updated_at) as last_updated
FROM shift_assignments sa
JOIN venues v ON sa.venue_id = v.id
JOIN positions p ON sa.position_id = p.id
LEFT JOIN pos_sales ps ON ps.venue_id = sa.venue_id
  AND ps.sale_timestamp >= DATE_TRUNC('hour', sa.shift_start)
  AND ps.sale_timestamp < DATE_TRUNC('hour', sa.shift_start) + INTERVAL '1 hour'
WHERE sa.shift_start IS NOT NULL AND sa.shift_end IS NOT NULL AND sa.shift_end > sa.shift_start
GROUP BY DATE_TRUNC('hour', sa.shift_start), sa.venue_id, v.name;

CREATE UNIQUE INDEX idx_labor_efficiency_hourly_unique ON labor_efficiency_hourly(venue_id, hour);

-- Daily labor metrics
CREATE MATERIALIZED VIEW labor_efficiency_daily AS
SELECT
  sa.venue_id,
  v.name as venue_name,
  DATE(sa.shift_start) as business_date,
  COUNT(DISTINCT sa.id) as shift_count,
  COUNT(DISTINCT sa.user_id) as employee_count,
  SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) as total_labor_hours,
  SUM((EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate) as labor_cost,
  AVG(p.hourly_rate) as avg_hourly_rate,
  COALESCE(SUM(ps.amount), 0) as revenue,
  CASE WHEN SUM(ps.amount) > 0 THEN
    (SUM((EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) * p.hourly_rate) / SUM(ps.amount)) * 100
  ELSE NULL END as labor_cost_pct,
  CASE WHEN SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600) > 0 THEN
    SUM(ps.amount) / SUM(EXTRACT(EPOCH FROM (sa.shift_end - sa.shift_start)) / 3600)
  ELSE NULL END as sales_per_labor_hour,
  COUNT(DISTINCT ps.id) as transaction_count,
  MAX(sa.updated_at) as last_updated
FROM shift_assignments sa
JOIN venues v ON sa.venue_id = v.id
JOIN positions p ON sa.position_id = p.id
LEFT JOIN pos_sales ps ON ps.venue_id = sa.venue_id AND DATE(ps.sale_timestamp) = DATE(sa.shift_start)
WHERE sa.shift_start IS NOT NULL AND sa.shift_end IS NOT NULL AND sa.shift_end > sa.shift_start
GROUP BY sa.venue_id, v.name, DATE(sa.shift_start);

CREATE UNIQUE INDEX idx_labor_efficiency_daily_unique ON labor_efficiency_daily(venue_id, business_date);
```

#### Migration 038: Daily Performance P&L

```sql
-- Complete daily P&L
CREATE MATERIALIZED VIEW daily_performance AS
SELECT
  v.id as venue_id,
  v.name as venue_name,
  DATE(ps.sale_timestamp) as business_date,
  COUNT(DISTINCT ps.id) as transaction_count,
  SUM(ps.amount) as gross_sales,
  AVG(ps.amount) as avg_ticket,
  SUM(COALESCE(ps.cogs, 0)) as total_cogs,
  CASE WHEN SUM(ps.amount) > 0 THEN
    (SUM(COALESCE(ps.cogs, 0)) / SUM(ps.amount)) * 100
  ELSE NULL END as cogs_pct,
  COALESCE(led.labor_cost, 0) as labor_cost,
  COALESCE(led.total_labor_hours, 0) as labor_hours,
  CASE WHEN SUM(ps.amount) > 0 THEN
    (COALESCE(led.labor_cost, 0) / SUM(ps.amount)) * 100
  ELSE NULL END as labor_pct,
  (SUM(COALESCE(ps.cogs, 0)) + COALESCE(led.labor_cost, 0)) as prime_cost,
  CASE WHEN SUM(ps.amount) > 0 THEN
    ((SUM(COALESCE(ps.cogs, 0)) + COALESCE(led.labor_cost, 0)) / SUM(ps.amount)) * 100
  ELSE NULL END as prime_cost_pct,
  (SUM(ps.amount) - SUM(COALESCE(ps.cogs, 0)) - COALESCE(led.labor_cost, 0)) as gross_profit,
  CASE WHEN SUM(ps.amount) > 0 THEN
    ((SUM(ps.amount) - SUM(COALESCE(ps.cogs, 0)) - COALESCE(led.labor_cost, 0)) / SUM(ps.amount)) * 100
  ELSE NULL END as gross_profit_pct,
  COALESCE(led.employee_count, 0) as employee_count,
  COALESCE(led.shift_count, 0) as shift_count,
  CASE WHEN COALESCE(led.total_labor_hours, 0) > 0 THEN
    SUM(ps.amount) / led.total_labor_hours
  ELSE NULL END as sales_per_labor_hour,
  MAX(ps.sale_timestamp) as last_sale_at,
  NOW() as last_refreshed_at
FROM venues v
LEFT JOIN pos_sales ps ON ps.venue_id = v.id
LEFT JOIN labor_efficiency_daily led ON led.venue_id = v.id AND led.business_date = DATE(ps.sale_timestamp)
WHERE v.is_active = true AND ps.sale_timestamp >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY v.id, v.name, DATE(ps.sale_timestamp), led.labor_cost, led.total_labor_hours, led.employee_count, led.shift_count;

CREATE UNIQUE INDEX idx_daily_performance_unique ON daily_performance(venue_id, business_date);
```

#### Migration 039: Variance & Exceptions Views

```sql
-- Daily variance: actual vs budget
CREATE OR REPLACE VIEW daily_variance AS
SELECT
  dp.venue_id,
  dp.venue_name,
  dp.business_date,
  dp.gross_sales as actual_sales,
  db.sales_budget as budget_sales,
  (dp.gross_sales - db.sales_budget) as sales_variance,
  CASE WHEN db.sales_budget > 0 THEN
    ((dp.gross_sales - db.sales_budget) / db.sales_budget) * 100
  ELSE NULL END as sales_variance_pct,
  CASE
    WHEN db.sales_budget = 0 THEN 'no_budget'
    WHEN ABS((dp.gross_sales - db.sales_budget) / db.sales_budget) > 0.15 THEN 'critical'
    WHEN ABS((dp.gross_sales - db.sales_budget) / db.sales_budget) > 0.08 THEN 'warning'
    ELSE 'normal'
  END as sales_status,
  dp.cogs_pct as actual_cogs_pct,
  db.cogs_budget_pct as budget_cogs_pct,
  (dp.cogs_pct - db.cogs_budget_pct) as cogs_variance_pct,
  CASE
    WHEN db.cogs_budget_pct = 0 THEN 'no_budget'
    WHEN (dp.cogs_pct - db.cogs_budget_pct) > 3 THEN 'critical'
    WHEN (dp.cogs_pct - db.cogs_budget_pct) > 1.5 THEN 'warning'
    ELSE 'normal'
  END as cogs_status,
  dp.labor_cost as actual_labor_cost,
  db.labor_budget as budget_labor_cost,
  (dp.labor_cost - db.labor_budget) as labor_variance,
  CASE WHEN db.labor_budget > 0 THEN
    ((dp.labor_cost - db.labor_budget) / db.labor_budget) * 100
  ELSE NULL END as labor_variance_pct,
  CASE
    WHEN db.labor_budget = 0 THEN 'no_budget'
    WHEN ((dp.labor_cost - db.labor_budget) / NULLIF(db.labor_budget, 0)) > 0.10 THEN 'critical'
    WHEN ((dp.labor_cost - db.labor_budget) / NULLIF(db.labor_budget, 0)) > 0.05 THEN 'warning'
    ELSE 'normal'
  END as labor_status,
  dp.prime_cost_pct as actual_prime_cost_pct,
  db.prime_cost_budget_pct as budget_prime_cost_pct,
  (dp.prime_cost_pct - db.prime_cost_budget_pct) as prime_cost_variance_pct,
  CASE
    WHEN db.prime_cost_budget_pct = 0 THEN 'no_budget'
    WHEN (dp.prime_cost_pct - db.prime_cost_budget_pct) > 5 THEN 'critical'
    WHEN (dp.prime_cost_pct - db.prime_cost_budget_pct) > 2 THEN 'warning'
    ELSE 'normal'
  END as prime_cost_status,
  dp.transaction_count,
  dp.labor_hours,
  dp.sales_per_labor_hour,
  dp.last_refreshed_at
FROM daily_performance dp
LEFT JOIN daily_budgets db ON dp.venue_id = db.venue_id AND dp.business_date = db.business_date
ORDER BY dp.business_date DESC, dp.venue_name;

-- Operational exceptions: only items needing attention
CREATE OR REPLACE VIEW operational_exceptions AS
-- Labor Over Budget
SELECT
  'labor_overage'::TEXT as exception_type,
  dv.venue_id,
  dv.venue_name,
  dv.business_date,
  'critical'::TEXT as severity,
  format('Labor %s%% over budget', ROUND(dv.labor_variance_pct, 1)) as title,
  format('Labor cost: $%s (budget: $%s). Variance: $%s (%s%%)',
    ROUND(dv.actual_labor_cost, 2), ROUND(dv.budget_labor_cost, 2),
    ROUND(dv.labor_variance, 2), ROUND(dv.labor_variance_pct, 1)) as description,
  jsonb_build_object(
    'actual', dv.actual_labor_cost, 'budget', dv.budget_labor_cost,
    'variance', dv.labor_variance, 'variance_pct', dv.labor_variance_pct
  ) as metadata
FROM daily_variance dv
WHERE dv.labor_status IN ('critical', 'warning')
  AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- COGS High
SELECT 'cogs_high'::TEXT, dv.venue_id, dv.venue_name, dv.business_date,
  dv.cogs_status::TEXT,
  format('COGS %s%% over budget', ROUND(dv.cogs_variance_pct, 1)),
  format('COGS: %s%% (budget: %s%%). Variance: %s%%',
    ROUND(dv.actual_cogs_pct, 1), ROUND(dv.budget_cogs_pct, 1), ROUND(dv.cogs_variance_pct, 1)),
  jsonb_build_object('actual_pct', dv.actual_cogs_pct, 'budget_pct', dv.budget_cogs_pct, 'variance_pct', dv.cogs_variance_pct)
FROM daily_variance dv
WHERE dv.cogs_status IN ('critical', 'warning') AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- Sales Low
SELECT 'sales_low'::TEXT, dv.venue_id, dv.venue_name, dv.business_date,
  dv.sales_status::TEXT,
  format('Sales %s%% under budget', ROUND(ABS(dv.sales_variance_pct), 1)),
  format('Sales: $%s (budget: $%s). Variance: $%s (%s%%)',
    ROUND(dv.actual_sales, 2), ROUND(dv.budget_sales, 2), ROUND(dv.sales_variance, 2), ROUND(dv.sales_variance_pct, 1)),
  jsonb_build_object('actual', dv.actual_sales, 'budget', dv.budget_sales, 'variance', dv.sales_variance, 'variance_pct', dv.sales_variance_pct)
FROM daily_variance dv
WHERE dv.sales_status IN ('critical', 'warning') AND dv.sales_variance < 0 AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- Low Stock
SELECT 'low_stock'::TEXT, ibr.venue_id, ibr.venue_name, CURRENT_DATE,
  CASE WHEN ibr.quantity_on_hand <= ibr.reorder_point * 0.5 THEN 'critical' ELSE 'warning' END::TEXT,
  format('%s at %s on-hand', ibr.item_name, ROUND(ibr.quantity_on_hand, 1)),
  format('Item: %s (SKU: %s). On-hand: %s, Reorder point: %s, Par: %s',
    ibr.item_name, ibr.sku, ROUND(ibr.quantity_on_hand, 1), ROUND(ibr.reorder_point, 1), ROUND(ibr.par_level, 1)),
  jsonb_build_object('item_id', ibr.item_id, 'sku', ibr.sku, 'quantity_on_hand', ibr.quantity_on_hand,
    'reorder_point', ibr.reorder_point, 'reorder_quantity', ibr.reorder_quantity, 'estimated_cost', ibr.estimated_order_cost)
FROM items_below_reorder ibr

UNION ALL

-- Pending Approvals
SELECT 'pending_approval'::TEXT, i.venue_id, v.name, i.invoice_date::DATE,
  CASE WHEN i.variance_severity = 'critical' THEN 'critical' ELSE 'warning' END::TEXT,
  format('Invoice %s pending approval', i.invoice_number),
  format('Vendor: %s. Amount: $%s. Variance: %s%% (%s)',
    vnd.name, ROUND(i.total_amount, 2), ROUND(i.total_variance_pct, 1), i.variance_severity),
  jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number, 'vendor_id', i.vendor_id,
    'total_amount', i.total_amount, 'variance_pct', i.total_variance_pct, 'variance_severity', i.variance_severity)
FROM invoices i
JOIN venues v ON i.venue_id = v.id
JOIN vendors vnd ON i.vendor_id = vnd.id
WHERE i.status = 'pending' AND i.auto_approved = false AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'

ORDER BY business_date DESC, severity DESC, exception_type;
```

#### Migration 040: Vendor Performance Scorecard

```sql
CREATE MATERIALIZED VIEW vendor_performance AS
SELECT
  v.id as vendor_id,
  v.name as vendor_name,
  v.category as vendor_category,
  COUNT(DISTINCT po.id) as order_count,
  SUM(po.total_amount) as total_spend,
  AVG(po.total_amount) as avg_order_value,
  COUNT(DISTINCT r.id) as receipt_count,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) as completed_receipts,
  CASE WHEN COUNT(DISTINCT r.id) > 0 THEN
    (COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END)::FLOAT / COUNT(DISTINCT r.id)) * 100
  ELSE NULL END as completion_rate,
  COUNT(DISTINCT CASE WHEN r.received_at::DATE <= po.delivery_date THEN r.id END) as on_time_deliveries,
  CASE WHEN COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END) > 0 THEN
    (COUNT(DISTINCT CASE WHEN r.received_at::DATE <= po.delivery_date THEN r.id END)::FLOAT /
     COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END)) * 100
  ELSE NULL END as on_time_rate,
  COUNT(DISTINCT inv.id) as invoice_count,
  COUNT(DISTINCT CASE WHEN inv.auto_approved = true THEN inv.id END) as auto_approved_invoices,
  AVG(CASE WHEN inv.match_confidence IS NOT NULL THEN inv.match_confidence ELSE NULL END) as avg_match_confidence,
  AVG(CASE WHEN inv.total_variance_pct IS NOT NULL THEN ABS(inv.total_variance_pct) ELSE NULL END) as avg_variance_pct,
  COUNT(DISTINCT a.id) FILTER (WHERE a.alert_type = 'cost_spike') as cost_spike_count,
  COUNT(DISTINCT rl.item_id) as unique_items_supplied,
  AVG(EXTRACT(EPOCH FROM (r.received_at - po.order_date)) / 86400) as avg_lead_time_days,
  MAX(po.order_date) as last_order_date,
  MAX(r.received_at) as last_receipt_date,
  MAX(inv.invoice_date) as last_invoice_date,
  -- Vendor Score (0-100): 40% on-time, 30% auto-approve, 20% low variance, 10% completion
  CASE WHEN COUNT(DISTINCT r.id) >= 5 THEN
    COALESCE(
      (CASE WHEN COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END) > 0
        THEN (COUNT(DISTINCT CASE WHEN r.received_at::DATE <= po.delivery_date THEN r.id END)::FLOAT /
              COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END)) * 40
        ELSE 20 END) +
      (CASE WHEN COUNT(DISTINCT inv.id) > 0
        THEN (COUNT(DISTINCT CASE WHEN inv.auto_approved = true THEN inv.id END)::FLOAT / COUNT(DISTINCT inv.id)) * 30
        ELSE 15 END) +
      (CASE WHEN COUNT(DISTINCT inv.id) > 0
        THEN (1 - (COUNT(DISTINCT CASE WHEN inv.variance_severity IN ('warning', 'critical') THEN inv.id END)::FLOAT / COUNT(DISTINCT inv.id))) * 20
        ELSE 10 END) +
      (CASE WHEN COUNT(DISTINCT r.id) > 0
        THEN (COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END)::FLOAT / COUNT(DISTINCT r.id)) * 10
        ELSE 5 END), 50)
  ELSE NULL END as vendor_score,
  NOW() as last_refreshed_at
FROM vendors v
LEFT JOIN purchase_orders po ON po.vendor_id = v.id AND po.order_date >= CURRENT_DATE - INTERVAL '90 days'
LEFT JOIN receipts r ON r.purchase_order_id = po.id
LEFT JOIN invoices inv ON inv.vendor_id = v.id AND inv.invoice_date >= CURRENT_DATE - INTERVAL '90 days'
LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id
LEFT JOIN alerts a ON a.metadata->>'vendor_name' = v.name AND a.alert_type = 'cost_spike'
  AND a.created_at >= CURRENT_DATE - INTERVAL '90 days'
WHERE v.is_active = true
GROUP BY v.id, v.name, v.category;

CREATE UNIQUE INDEX idx_vendor_performance_vendor_id ON vendor_performance(vendor_id);
```

#### Migration 041: Exception Rules Engine

```sql
CREATE TABLE exception_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_category TEXT NOT NULL CHECK (rule_category IN ('invoice', 'receipt', 'variance', 'inventory', 'labor')),
  field_name TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('>', '<', '>=', '<=', '=', '!=', 'between')),
  threshold_value NUMERIC(12,4),
  threshold_min NUMERIC(12,4),
  threshold_max NUMERIC(12,4),
  action TEXT NOT NULL CHECK (action IN ('auto_approve', 'require_review', 'alert', 'block')),
  alert_severity TEXT CHECK (alert_severity IN ('info', 'warning', 'critical')),
  apply_to_venues UUID[],
  apply_to_vendors UUID[],
  apply_to_categories TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default rules
INSERT INTO exception_rules (rule_name, rule_category, field_name, operator, threshold_pct, action, alert_severity, priority, description) VALUES
  ('Auto-approve invoices with <2% variance', 'invoice', 'total_variance_pct', '<', 2, 'auto_approve', NULL, 10, 'Automatically approve invoices with variance under 2%'),
  ('Review invoices with 2-5% variance', 'invoice', 'total_variance_pct', 'between', NULL, 'require_review', 'warning', 20, 'Flag for review if variance between 2-5%'),
  ('Block invoices with >10% variance', 'invoice', 'total_variance_pct', '>', 10, 'block', 'critical', 30, 'Block and alert on invoices with >10% variance'),
  ('Alert on labor cost >10% over budget', 'variance', 'labor_variance_pct', '>', 10, 'alert', 'critical', 50, 'Critical alert when labor exceeds budget by 10%'),
  ('Warn on labor cost >5% over budget', 'variance', 'labor_variance_pct', '>', 5, 'alert', 'warning', 60, 'Warning when labor exceeds budget by 5%'),
  ('Alert on COGS >3% over budget', 'variance', 'cogs_variance_pct', '>', 3, 'alert', 'critical', 70, 'Critical alert when COGS variance exceeds 3%')
ON CONFLICT (rule_name) DO NOTHING;
```

#### Migration 042: pg_cron Jobs

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Hourly: Refresh labor efficiency (11am-11pm)
SELECT cron.schedule('refresh-labor-efficiency-hourly', '0 11-23 * * *',
  $$SELECT refresh_labor_efficiency_views()$$);

-- Every 15 min: Refresh daily performance (11am-11pm)
SELECT cron.schedule('refresh-daily-performance-15min', '*/15 11-23 * * *',
  $$SELECT refresh_daily_performance()$$);

-- Daily 6am: Refresh vendor performance
SELECT cron.schedule('refresh-vendor-performance-daily', '0 6 * * *',
  $$SELECT refresh_vendor_performance()$$);

-- Weekly cleanup: Old alerts (Sundays at 3am)
SELECT cron.schedule('cleanup-old-alerts', '0 3 * * 0',
  $$DELETE FROM alerts WHERE acknowledged = true AND acknowledged_at < NOW() - INTERVAL '90 days'$$);

-- Weekly cleanup: Old cost history (Sundays at 4am)
SELECT cron.schedule('cleanup-old-cost-history', '0 4 * * 0',
  $$DELETE FROM item_cost_history WHERE effective_date < NOW() - INTERVAL '2 years'$$);
```

#### Migration 043: Row-Level Security

```sql
-- Enable RLS on all intelligence layer tables
ALTER TABLE recipe_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_pars ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_rules ENABLE ROW LEVEL SECURITY;

-- Create policies (venue-based access control)
-- [See migration file for complete policy definitions]
```

---

## API Reference

### Performance Metrics

#### `GET /api/performance/daily/[venueId]/[date]`

Returns complete daily P&L performance with variance analysis and alerts.

**Parameters:**
- `venueId` (path, UUID) - Venue identifier
- `date` (path, YYYY-MM-DD) - Business date

**Response:**
```json
{
  "success": true,
  "data": {
    "performance": {
      "venue_id": "uuid",
      "venue_name": "Test Venue",
      "business_date": "2025-11-10",
      "transaction_count": 45,
      "gross_sales": 1250.00,
      "avg_ticket": 27.78,
      "total_cogs": 356.25,
      "cogs_pct": 28.5,
      "labor_cost": 278.75,
      "labor_hours": 32.5,
      "labor_pct": 22.3,
      "prime_cost": 635.00,
      "prime_cost_pct": 50.8,
      "gross_profit": 615.00,
      "gross_profit_pct": 49.2,
      "employee_count": 8,
      "shift_count": 12,
      "sales_per_labor_hour": 38.46,
      "last_sale_at": "2025-11-10T22:45:00Z",
      "last_refreshed_at": "2025-11-10T22:50:00Z"
    },
    "variance": {
      "actual_sales": 1250.00,
      "budget_sales": 1000.00,
      "sales_variance": 250.00,
      "sales_variance_pct": 25.0,
      "sales_status": "normal",
      "actual_cogs_pct": 28.5,
      "budget_cogs_pct": 30.0,
      "cogs_variance_pct": -1.5,
      "cogs_status": "normal",
      "actual_labor_cost": 278.75,
      "budget_labor_cost": 250.00,
      "labor_variance": 28.75,
      "labor_variance_pct": 11.5,
      "labor_status": "warning",
      "actual_prime_cost_pct": 50.8,
      "budget_prime_cost_pct": 60.0,
      "prime_cost_variance_pct": -9.2,
      "prime_cost_status": "normal"
    },
    "alerts": [
      {
        "id": "uuid",
        "venue_id": "uuid",
        "alert_type": "labor_overage",
        "severity": "warning",
        "title": "Labor 11.5% over budget",
        "message": "Labor cost: $278.75 (budget: $250.00). Variance: $28.75 (11.5%)",
        "metadata": {
          "actual": 278.75,
          "budget": 250.00,
          "variance": 28.75,
          "variance_pct": 11.5
        },
        "acknowledged": false,
        "created_at": "2025-11-10T22:00:00Z"
      }
    ],
    "hourly": [
      {
        "hour": "2025-11-10T18:00:00Z",
        "shift_count": 4,
        "total_labor_hours": 4.0,
        "labor_cost": 72.00,
        "revenue": 425.00,
        "labor_cost_pct": 16.9,
        "sales_per_labor_hour": 106.25,
        "transaction_count": 18
      }
    ],
    "date": "2025-11-10",
    "venueId": "uuid"
  }
}
```

**Authentication:** Required
**Rate Limit:** 100 requests/minute
**Caching:** MView refreshed every 15 minutes

---

#### `GET /api/labor/efficiency/[venueId]/[date]`

Returns labor efficiency metrics with hourly breakdown.

**Parameters:**
- `venueId` (path, UUID) - Venue identifier
- `date` (path, YYYY-MM-DD) - Business date

**Response:**
```json
{
  "success": true,
  "data": {
    "daily": {
      "venue_id": "uuid",
      "venue_name": "Test Venue",
      "business_date": "2025-11-10",
      "shift_count": 12,
      "employee_count": 8,
      "total_labor_hours": 32.5,
      "labor_cost": 278.75,
      "avg_hourly_rate": 17.50,
      "revenue": 1250.00,
      "labor_cost_pct": 22.3,
      "sales_per_labor_hour": 38.46,
      "transaction_count": 45
    },
    "hourly": [
      {
        "hour": "2025-11-10T11:00:00Z",
        "shift_count": 2,
        "total_labor_hours": 2.0,
        "labor_cost": 35.00,
        "revenue": 0,
        "labor_cost_pct": null,
        "sales_per_labor_hour": 0
      },
      {
        "hour": "2025-11-10T12:00:00Z",
        "shift_count": 3,
        "total_labor_hours": 3.0,
        "labor_cost": 52.50,
        "revenue": 125.00,
        "labor_cost_pct": 42.0,
        "sales_per_labor_hour": 41.67
      }
    ],
    "shifts": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "position_id": "uuid",
        "shift_start": "2025-11-10T11:00:00Z",
        "shift_end": "2025-11-10T19:00:00Z",
        "position": {
          "name": "Line Cook",
          "hourly_rate": 18.00
        },
        "user": {
          "email": "cook@venue.com"
        }
      }
    ],
    "date": "2025-11-10",
    "venueId": "uuid"
  }
}
```

**Authentication:** Required
**Rate Limit:** 100 requests/minute

---

### Exceptions & Alerts

#### `GET /api/exceptions`

Returns exception-first view showing only items requiring operator attention.

**Query Parameters:**
- `venue_id` (optional, UUID) - Filter by specific venue
- `severity` (optional, enum) - Filter by severity: `info`, `warning`, `critical`

**Response:**
```json
{
  "success": true,
  "data": {
    "exceptions": [
      {
        "exception_type": "labor_overage",
        "venue_id": "uuid",
        "venue_name": "Test Venue",
        "business_date": "2025-11-10",
        "severity": "critical",
        "title": "Labor 15% over budget",
        "description": "Labor cost: $287.50 (budget: $250.00). Variance: $37.50 (15.0%)",
        "metadata": {
          "actual": 287.50,
          "budget": 250.00,
          "variance": 37.50,
          "variance_pct": 15.0
        }
      },
      {
        "exception_type": "cogs_high",
        "venue_id": "uuid",
        "venue_name": "Test Venue",
        "business_date": "2025-11-10",
        "severity": "warning",
        "title": "COGS 2.5% over budget",
        "description": "COGS: 32.5% (budget: 30.0%). Variance: 2.5%",
        "metadata": {
          "actual_pct": 32.5,
          "budget_pct": 30.0,
          "variance_pct": 2.5
        }
      },
      {
        "exception_type": "low_stock",
        "venue_id": "uuid",
        "venue_name": "Test Venue",
        "business_date": "2025-11-10",
        "severity": "warning",
        "title": "Chicken Breast at 8.5 on-hand",
        "description": "Item: Chicken Breast (SKU: CHKN-001). On-hand: 8.5, Reorder point: 50, Par: 100",
        "metadata": {
          "item_id": "uuid",
          "sku": "CHKN-001",
          "quantity_on_hand": 8.5,
          "reorder_point": 50,
          "reorder_quantity": 100,
          "estimated_cost": 550.00
        }
      },
      {
        "exception_type": "pending_approval",
        "venue_id": "uuid",
        "venue_name": "Test Venue",
        "business_date": "2025-11-10",
        "severity": "warning",
        "title": "Invoice INV-12345 pending approval",
        "description": "Vendor: Sysco. Amount: $1,250.00. Variance: 5.2% (warning)",
        "metadata": {
          "invoice_id": "uuid",
          "invoice_number": "INV-12345",
          "vendor_id": "uuid",
          "total_amount": 1250.00,
          "variance_pct": 5.2,
          "variance_severity": "warning"
        }
      }
    ],
    "summary": {
      "total": 5,
      "critical": 1,
      "warning": 3,
      "info": 1,
      "byType": {
        "labor_overage": 1,
        "cogs_high": 1,
        "low_stock": 2,
        "pending_approval": 1
      }
    }
  }
}
```

**Authentication:** Required
**Rate Limit:** 100 requests/minute
**Real-time:** View is not cached, queries live data

---

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

**Error Responses:**
- `404` - Alert not found
- `403` - Access denied (user doesn't have access to venue)
- `400` - Alert already acknowledged

**Authentication:** Required
**Rate Limit:** 100 requests/minute

---

### Invoice Processing (Existing)

#### `POST /api/invoices/ocr`

Upload and process invoice with Claude Sonnet OCR.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `file` (File) - PDF or image (JPEG, PNG, WebP)
  - `venue_id` (string, UUID) - Venue identifier

**Response:**
```json
{
  "success": true,
  "invoiceId": "uuid",
  "normalized": {
    "vendorId": "uuid",
    "invoiceNumber": "INV-12345",
    "invoiceDate": "2025-11-10",
    "dueDate": "2025-12-10",
    "totalAmount": 1250.00,
    "ocrConfidence": 0.95,
    "lines": [
      {
        "itemId": "uuid",
        "description": "Chicken Breast",
        "qty": 50,
        "unitCost": 5.50,
        "lineTotal": 275.00,
        "ocrConfidence": 0.92,
        "matchType": "exact"
      }
    ],
    "warnings": []
  },
  "imageUrl": "https://...",
  "needsReview": false,
  "reviewUrl": "/invoices/uuid/review"
}
```

**Authentication:** Required
**Rate Limit:** 10 requests/minute (OCR is expensive)

---

#### `POST /api/invoices/[id]/auto-match`

Auto-match invoice to purchase order.

**Response:**
```json
{
  "success": true,
  "matched": true,
  "match_confidence": 0.92,
  "purchase_order_id": "uuid",
  "variance_pct": 2.5,
  "variance_severity": "normal"
}
```

---

## UI Components

### DailyPerformanceCard

**Location:** `components/dashboard/DailyPerformanceCard.tsx`

Displays daily P&L metrics with variance indicators.

**Props:**
```typescript
interface DailyPerformanceCardProps {
  performance: {
    gross_sales: number;
    cogs_pct: number;
    labor_pct: number;
    prime_cost_pct: number;
    transaction_count: number;
    labor_hours: number;
    sales_per_labor_hour: number;
  } | null;
  variance: {
    sales_variance: number;
    sales_status: 'normal' | 'warning' | 'critical';
    cogs_variance_pct: number;
    cogs_status: 'normal' | 'warning' | 'critical';
    labor_variance_pct: number;
    labor_status: 'normal' | 'warning' | 'critical';
    prime_cost_variance_pct: number;
    prime_cost_status: 'normal' | 'warning' | 'critical';
  } | null;
  date: string;
  venueName?: string;
  className?: string;
}
```

**Usage:**
```tsx
import { DailyPerformanceCard } from '@/components/dashboard/DailyPerformanceCard';

export default function Dashboard() {
  const [performance, setPerformance] = useState(null);
  const [variance, setVariance] = useState(null);

  useEffect(() => {
    fetch(`/api/performance/daily/${venueId}/${date}`)
      .then(res => res.json())
      .then(data => {
        setPerformance(data.data.performance);
        setVariance(data.data.variance);
      });
  }, [venueId, date]);

  return (
    <DailyPerformanceCard
      performance={performance}
      variance={variance}
      date="2025-11-10"
      venueName="Test Venue"
    />
  );
}
```

**Features:**
- ✅ 4-metric grid: Sales, COGS%, Labor%, Prime Cost%
- ✅ Color-coded variance badges (green/yellow/red)
- ✅ SPLH and avg ticket display
- ✅ Transaction count and labor hours
- ✅ Status badge (On Track / Needs Attention / Critical)
- ✅ Responsive design (mobile-friendly)

---

### ExceptionsPanel

**Location:** `components/dashboard/ExceptionsPanel.tsx`

Real-time exception dashboard showing only items requiring attention.

**Props:**
```typescript
interface ExceptionsPanelProps {
  venueId?: string;  // Optional filter by venue
  className?: string;
}
```

**Usage:**
```tsx
import { ExceptionsPanel } from '@/components/dashboard/ExceptionsPanel';

export default function Dashboard() {
  return (
    <div>
      <ExceptionsPanel venueId="optional-venue-id" />
    </div>
  );
}
```

**Features:**
- ✅ Auto-refresh every 60 seconds
- ✅ Filter by severity (All / Critical / Warning / Info)
- ✅ Dismissable exceptions
- ✅ Icon-coded exception types
- ✅ Summary counts
- ✅ Color-coded severity badges
- ✅ "All clear" state when no exceptions
- ✅ Venue and date display

**Exception Types:**
- `labor_overage` - Labor cost over budget
- `cogs_high` - COGS percentage over budget
- `sales_low` - Sales under budget
- `prime_cost_high` - Prime cost exceeds threshold
- `low_stock` - Inventory below reorder point
- `pending_approval` - Invoices awaiting approval

---

## Testing Infrastructure

### Test Suite Structure

```
supabase/tests/
├── README.md                          # Testing documentation
├── run-tests.sh                       # Test runner script
├── fixtures/
│   └── test-data.sql                  # Seed data for tests
└── unit/
    ├── 031_recipe_inventory_bridge.test.sql
    ├── 032_budgets_alerts.test.sql
    └── 035_inventory_deduction_trigger.test.sql
```

### Running Tests

```bash
# Run all tests
npm run test:db

# Run unit tests only
npm run test:db:unit

# Run with verbose output
npm run test:db:verbose

# Seed test data
npm run test:db:seed

# Filter tests by migration number
npm run test:db -- --filter=031
```

### Test Coverage

#### Migration 031: Recipe-Inventory Bridge (8 tests)
- ✅ Calculate simple recipe cost
- ✅ Calculate complex recipe cost (multiple components)
- ✅ Recipe cost history is stored
- ✅ Handle missing inventory cost
- ✅ Recipe components unique constraint
- ✅ Recipe cost calculation with NULL venue_id
- ✅ Recipe component quantity must be positive
- ✅ updated_at timestamp auto-updates

#### Migration 032: Budgets & Alerts (12 tests)
- ✅ Create alert function
- ✅ Alert defaults to unacknowledged
- ✅ Acknowledge alert function
- ✅ Cannot re-acknowledge alert
- ✅ Daily budget unique constraint
- ✅ Budget percentages must be valid (0-100)
- ✅ Budget amounts must be non-negative
- ✅ Alert with metadata
- ✅ Alert severity enum validation
- ✅ Alert type enum validation
- ✅ Alert rule can be inactive
- ✅ Budget updated_at timestamp auto-updates

#### Migration 035: Inventory Deduction Trigger (9 tests) ⭐ CRITICAL
- ✅ POS sale with recipe_id triggers inventory deduction
- ✅ COGS is calculated and stamped on sale
- ✅ Multiple quantity sale deducts correct amount
- ✅ Inventory transaction is created with negative quantity
- ✅ Multiple components are all deducted
- ✅ Sale without recipe_id does NOT trigger deduction
- ✅ COGS reflects total cost of multiple components
- ✅ Trigger handles missing inventory balance gracefully
- ✅ Update recipe_id triggers recalculation

### Writing New Tests

**SQL Test Template:**
```sql
-- Test: [Description]
BEGIN;

-- Setup
\i supabase/tests/fixtures/test-data.sql

-- Execute
DO $$
DECLARE
  v_result NUMERIC;
BEGIN
  -- Call function
  v_result := calculate_recipe_cost('test-recipe-001', 'test-venue-001');

  -- Assert
  IF v_result != 3.05 THEN
    RAISE EXCEPTION 'Expected 3.05, got %', v_result;
  END IF;

  RAISE NOTICE 'PASS: Test name';
END $$;

ROLLBACK;
```

### Test Utilities

**Load test fixtures:**
```sql
\i supabase/tests/fixtures/test-data.sql
```

**Assert helpers:**
```sql
-- Check equality
IF actual != expected THEN
  RAISE EXCEPTION 'Expected %, got %', expected, actual;
END IF;

-- Check within tolerance
IF ABS(actual - expected) > 0.01 THEN
  RAISE EXCEPTION 'Expected ~%, got %', expected, actual;
END IF;

-- Check exists
IF NOT EXISTS (SELECT 1 FROM table WHERE condition) THEN
  RAISE EXCEPTION 'Record not found';
END IF;
```

---

## Deployment Guide

### Prerequisites

1. **Docker Desktop** - Required for local Supabase
2. **Node.js 18+** - For Next.js
3. **Supabase CLI** - `npm install -g supabase`
4. **PostgreSQL Client** - For running SQL directly

### Phase 0: Data Foundation (Week 1)

#### Step 1: Start Local Environment

```bash
# Start Docker Desktop first

# Navigate to project
cd "c:\Users\JacobShure\RESTAURANT APP"

# Start Supabase locally
npx supabase start

# Note the connection strings displayed
```

#### Step 2: Run Migrations

```bash
# Apply all migrations (001-043)
npx supabase db reset

# Verify migrations succeeded
npx supabase db diff
```

#### Step 3: Run Test Suite

```bash
# Run all tests
npm run test:db

# Expected output: All tests passed ✓
```

#### Step 4: Seed Core Data

```bash
# Seed test data (for development)
npm run test:db:seed

# OR seed production H.wood data
psql $DATABASE_URL -f scripts/seed-hwood-data.sql
```

#### Step 5: Configure Recipe Components

For each menu item:
1. Create recipe in `recipes` table
2. Link to inventory items in `recipe_components`
3. Set quantities and units

**Example:**
```sql
-- Create recipe
INSERT INTO recipes (id, name, venue_id, category, yield_quantity, yield_unit)
VALUES ('recipe-uuid', 'Grilled Chicken', 'venue-uuid', 'entree', 1, 'serving');

-- Link to inventory
INSERT INTO recipe_components (recipe_id, item_id, quantity, unit) VALUES
('recipe-uuid', 'chicken-breast-uuid', 0.5, 'lb'),
('recipe-uuid', 'olive-oil-uuid', 0.02, 'gal'),
('recipe-uuid', 'garlic-uuid', 2, 'clove');

-- Calculate initial cost
SELECT calculate_recipe_cost('recipe-uuid', 'venue-uuid');
```

#### Step 6: Set Daily Budgets

```sql
-- Set budgets for next 30 days
INSERT INTO daily_budgets (venue_id, business_date, sales_budget, labor_budget, cogs_budget_pct, prime_cost_budget_pct)
SELECT
  'venue-uuid',
  date,
  1000.00,  -- Adjust per venue
  250.00,   -- Adjust per venue
  30.00,    -- 30% COGS target
  60.00     -- 60% Prime Cost target
FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', '1 day') date;
```

#### Step 7: Configure Item Pars

```sql
-- Set par levels for top inventory items
INSERT INTO item_pars (venue_id, item_id, par_level, reorder_point, reorder_quantity)
VALUES
('venue-uuid', 'chicken-breast-uuid', 100, 50, 100),
('venue-uuid', 'olive-oil-uuid', 25, 15, 20),
('venue-uuid', 'vodka-uuid', 50, 25, 30);
```

#### Step 8: Map POS to Recipes

Ensure POS menu items are mapped to `recipes.id`:

```sql
-- Add recipe_id to existing POS sales (backfill)
UPDATE pos_sales ps
SET recipe_id = (
  SELECT r.id
  FROM recipes r
  WHERE r.name ILIKE ps.item_name
  LIMIT 1
)
WHERE ps.recipe_id IS NULL
  AND ps.sale_timestamp >= CURRENT_DATE - INTERVAL '7 days';
```

#### Step 9: Initial MView Refresh

```bash
# Manually refresh all materialized views
psql $DATABASE_URL -c "SELECT refresh_labor_efficiency_views();"
psql $DATABASE_URL -c "SELECT refresh_daily_performance();"
psql $DATABASE_URL -c "SELECT refresh_vendor_performance();"
```

#### Step 10: Verify System Health

```sql
-- Check MView refresh status
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Verify recipe costs calculated
SELECT COUNT(*) FROM recipe_costs WHERE calculated_at > NOW() - INTERVAL '1 hour';

-- Check COGS stamped on sales
SELECT COUNT(*), COUNT(cogs), (COUNT(cogs)::FLOAT / COUNT(*)) * 100 as pct
FROM pos_sales WHERE sale_timestamp > NOW() - INTERVAL '24 hours';

-- Verify alerts generated
SELECT alert_type, COUNT(*) FROM alerts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY alert_type;
```

---

### Phase 1: Pilot Deployment (Weeks 2-4)

#### Step 1: Deploy to Staging

```bash
# Push to staging branch
git checkout staging
git merge main
git push origin staging

# Vercel auto-deploys on push
# Or manually:
vercel deploy --prod
```

#### Step 2: Run Staging Migrations

```bash
# Connect to staging Supabase
npx supabase link --project-ref staging-project-id

# Push migrations
npx supabase db push
```

#### Step 3: Select Pilot Venue

Choose 1 H.wood venue with:
- Complete recipe mapping
- Active POS integration
- Stable operations team
- Recommended: Mistral or Jurassic Coffee Bar

#### Step 4: Enable Triggers (Staged)

```sql
-- Initially in LOG mode
ALTER TABLE pos_sales DISABLE TRIGGER process_sale_inventory_trigger;
ALTER TABLE receipt_lines DISABLE TRIGGER detect_cost_spike_trigger;

-- Monitor for 24 hours, then enable
ALTER TABLE pos_sales ENABLE TRIGGER process_sale_inventory_trigger;
ALTER TABLE receipt_lines ENABLE TRIGGER detect_cost_spike_trigger;
```

#### Step 5: Train Pilot Team

1. Schedule 1-hour training session
2. Demo exception-first dashboard
3. Walk through alert acknowledgment
4. Explain SPLH and prime cost metrics
5. Review variance thresholds

**Training Materials:**
- Dashboard walkthrough video
- Exception types reference card
- Alert response flowchart

#### Step 6: Monitor for 72 Hours

**Daily Checklist:**
- ✅ Check MView refresh times (<2s target)
- ✅ Verify COGS calculations (spot check 20 sales)
- ✅ Review alert volume (expect 5-10/day initially)
- ✅ Confirm inventory deductions working
- ✅ Check exception panel accuracy

**Key Metrics:**
```sql
-- Alert volume
SELECT DATE(created_at), alert_type, COUNT(*)
FROM alerts
WHERE created_at > NOW() - INTERVAL '3 days'
GROUP BY DATE(created_at), alert_type;

-- COGS accuracy (compare to manual calculation)
SELECT ps.id, ps.item_name, ps.cogs,
  (SELECT SUM(rc.quantity * ib.last_cost)
   FROM recipe_components rc
   JOIN inventory_balances ib ON rc.item_id = ib.item_id
   WHERE rc.recipe_id = ps.recipe_id) as manual_cogs,
  ABS(ps.cogs - (SELECT SUM(rc.quantity * ib.last_cost)
                  FROM recipe_components rc
                  JOIN inventory_balances ib ON rc.item_id = ib.item_id
                  WHERE rc.recipe_id = ps.recipe_id)) as variance
FROM pos_sales ps
WHERE ps.recipe_id IS NOT NULL
  AND ps.sale_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY variance DESC LIMIT 20;

-- MView refresh performance
SELECT jobname, end_time - start_time as duration
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '3 days'
ORDER BY start_time DESC;
```

#### Step 7: Collect Feedback

**Manager Survey Questions:**
1. How useful is the exception-first dashboard? (1-10)
2. Are alerts actionable and accurate? (1-10)
3. What exceptions are missing?
4. What exceptions are noise (false positives)?
5. What would make this more useful?

#### Step 8: Tune Alert Thresholds

Based on feedback, adjust `exception_rules`:

```sql
-- Example: Increase labor variance threshold if too noisy
UPDATE exception_rules
SET threshold_pct = 7  -- Was 5
WHERE rule_name = 'Warn on labor cost >5% over budget';

-- Example: Add new rule
INSERT INTO exception_rules (rule_name, rule_category, field_name, operator, threshold_value, action, alert_severity, priority, description)
VALUES ('High ticket avg', 'variance', 'avg_ticket', '>', 50, 'alert', 'info', 90, 'Alert when average ticket exceeds $50');
```

---

### Phase 2: Full Rollout (Week 5+)

#### Step 1: Rollout Schedule

**Week 5:**
- Deploy to 3 additional venues
- Monitor for 1 week

**Week 6:**
- Deploy to remaining H.wood venues
- All venues on exception-first workflow

**Week 7+:**
- Enable Slack/email notifications
- Weekly performance review meetings
- Continuous optimization

#### Step 2: Enable Notifications

```sql
-- Add Slack webhook to alert rules
UPDATE alert_rules
SET notification_channels = ARRAY['in_app', 'slack']
WHERE severity = 'critical';
```

**Configure Slack Webhook:**
```typescript
// lib/notifications/slack.ts
export async function sendSlackAlert(alert: Alert) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 ${alert.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${alert.title}*\n${alert.message}`
          }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Venue: ${alert.venue_name}` },
            { type: 'mrkdwn', text: `Severity: ${alert.severity}` }
          ]
        }
      ]
    })
  });
}
```

#### Step 3: Manager Training (All Venues)

**Training Schedule:**
- Week 5: Managers from new 3 venues
- Week 6: All remaining managers
- Week 7: Refresh training for pilot venue

**Training Agenda:**
1. System overview (15 min)
2. Dashboard walkthrough (20 min)
3. Alert response procedures (15 min)
4. Q&A (10 min)

#### Step 4: Weekly Performance Reviews

**Every Monday at 10am:**
1. Review previous week's metrics
2. Discuss variance trends
3. Identify improvement opportunities
4. Adjust budgets if needed

**Meeting Template:**
```sql
-- Generate weekly summary
SELECT
  venue_name,
  AVG(gross_sales) as avg_daily_sales,
  AVG(prime_cost_pct) as avg_prime_cost,
  AVG(sales_per_labor_hour) as avg_splh,
  COUNT(CASE WHEN prime_cost_status = 'critical' THEN 1 END) as critical_days
FROM daily_variance
WHERE business_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY venue_name
ORDER BY avg_prime_cost DESC;
```

---

## Monitoring & Operations

### Key Performance Indicators

#### System Health

| Metric | Target | Query |
|--------|--------|-------|
| MView refresh time | <2s | `SELECT jobname, AVG(end_time - start_time) FROM cron.job_run_details WHERE start_time > NOW() - INTERVAL '7 days' GROUP BY jobname;` |
| API p95 response time | <500ms | Monitor via Vercel dashboard |
| Trigger execution time | <100ms | `EXPLAIN ANALYZE SELECT process_sale_inventory();` |
| Database CPU usage | <70% | Supabase dashboard |

#### Data Quality

| Metric | Target | Query |
|--------|--------|-------|
| POS sales with recipe_id | >95% | `SELECT COUNT(recipe_id)::FLOAT / COUNT(*) * 100 FROM pos_sales WHERE sale_timestamp > NOW() - INTERVAL '7 days';` |
| COGS calculation accuracy | >99% | Manual spot checks |
| Recipe cost drift | <5%/week | `SELECT recipe_id, AVG(total_cost), STDDEV(total_cost) FROM recipe_costs WHERE calculated_at > NOW() - INTERVAL '7 days' GROUP BY recipe_id HAVING STDDEV(total_cost) / AVG(total_cost) > 0.05;` |

#### Business Metrics

| Metric | Target | Query |
|--------|--------|-------|
| Exception count per day | Trending down | `SELECT DATE(business_date), COUNT(*) FROM operational_exceptions GROUP BY DATE(business_date) ORDER BY DATE(business_date);` |
| Alert acknowledgment rate | >90% | `SELECT COUNT(CASE WHEN acknowledged THEN 1 END)::FLOAT / COUNT(*) * 100 FROM alerts WHERE created_at > NOW() - INTERVAL '7 days';` |
| Auto-approval rate (invoices) | >90% | `SELECT COUNT(CASE WHEN auto_approved THEN 1 END)::FLOAT / COUNT(*) * 100 FROM invoices WHERE invoice_date > NOW() - INTERVAL '7 days';` |
| Prime cost variance days | <2/week | `SELECT COUNT(*) FROM daily_variance WHERE prime_cost_status != 'normal' AND business_date > NOW() - INTERVAL '7 days';` |

### Observability Queries

#### Check Recent Alerts

```sql
SELECT
  DATE(created_at) as date,
  alert_type,
  severity,
  COUNT(*) as count,
  COUNT(CASE WHEN acknowledged THEN 1 END) as acknowledged_count
FROM alerts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), alert_type, severity
ORDER BY date DESC, count DESC;
```

#### Verify COGS Accuracy

```sql
-- Compare calculated COGS to manual calculation
SELECT
  ps.id,
  ps.item_name,
  ps.cogs as calculated_cogs,
  (SELECT SUM(rc.quantity * ib.last_cost)
   FROM recipe_components rc
   JOIN inventory_balances ib ON rc.item_id = ib.item_id AND ib.venue_id = ps.venue_id
   WHERE rc.recipe_id = ps.recipe_id) as manual_cogs,
  ABS(ps.cogs - (SELECT SUM(rc.quantity * ib.last_cost)
                  FROM recipe_components rc
                  JOIN inventory_balances ib ON rc.item_id = ib.item_id AND ib.venue_id = ps.venue_id
                  WHERE rc.recipe_id = ps.recipe_id)) as variance
FROM pos_sales ps
WHERE ps.recipe_id IS NOT NULL
  AND ps.sale_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY variance DESC
LIMIT 20;
```

#### Monitor MView Refresh

```sql
SELECT
  jobname,
  start_time,
  end_time,
  end_time - start_time as duration,
  status,
  return_message
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC;
```

#### Find Missing Recipe IDs

```sql
SELECT
  venue_id,
  item_name,
  COUNT(*) as sale_count,
  SUM(amount) as total_sales
FROM pos_sales
WHERE recipe_id IS NULL
  AND sale_timestamp > NOW() - INTERVAL '7 days'
GROUP BY venue_id, item_name
ORDER BY total_sales DESC
LIMIT 50;
```

#### Check Recipe Cost Drift

```sql
SELECT
  r.name as recipe_name,
  COUNT(rc.calculated_at) as calculations,
  MIN(rc.total_cost) as min_cost,
  MAX(rc.total_cost) as max_cost,
  AVG(rc.total_cost) as avg_cost,
  STDDEV(rc.total_cost) as std_dev,
  (STDDEV(rc.total_cost) / NULLIF(AVG(rc.total_cost), 0)) * 100 as coeff_variation_pct
FROM recipes r
JOIN recipe_costs rc ON r.id = rc.recipe_id
WHERE rc.calculated_at > NOW() - INTERVAL '30 days'
GROUP BY r.id, r.name
HAVING COUNT(rc.calculated_at) > 5
ORDER BY coeff_variation_pct DESC
LIMIT 20;
```

#### Analyze Exception Trends

```sql
SELECT
  exception_type,
  DATE_TRUNC('day', business_date) as day,
  COUNT(*) as count,
  AVG(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) * 100 as critical_pct
FROM operational_exceptions
WHERE business_date > NOW() - INTERVAL '30 days'
GROUP BY exception_type, DATE_TRUNC('day', business_date)
ORDER BY day DESC, count DESC;
```

#### Vendor Cost Spike Analysis

```sql
SELECT
  v.name as vendor_name,
  i.name as item_name,
  COUNT(a.id) as spike_count,
  AVG((a.metadata->>'variance_pct')::NUMERIC) as avg_variance_pct,
  MAX((a.metadata->>'z_score')::NUMERIC) as max_z_score
FROM alerts a
JOIN vendors v ON a.metadata->>'vendor_name' = v.name
JOIN items i ON a.metadata->>'item_id' = i.id::TEXT
WHERE a.alert_type = 'cost_spike'
  AND a.created_at > NOW() - INTERVAL '90 days'
GROUP BY v.name, i.name
ORDER BY spike_count DESC
LIMIT 20;
```

### Logging & Debugging

#### Enable Query Logging

```sql
-- Enable slow query logging
ALTER DATABASE postgres SET log_min_duration_statement = 1000; -- Log queries >1s

-- View slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 500
ORDER BY mean_time DESC
LIMIT 20;
```

#### Trigger Debugging

```sql
-- Test trigger in isolation
BEGIN;

-- Insert test sale
INSERT INTO pos_sales (id, venue_id, recipe_id, amount, quantity, sale_timestamp, item_name)
VALUES ('test-uuid', 'venue-uuid', 'recipe-uuid', 28.00, 1, NOW(), 'Test Item');

-- Check trigger executed
SELECT * FROM inventory_transactions WHERE reference_id = 'test-uuid';
SELECT cogs FROM pos_sales WHERE id = 'test-uuid';

ROLLBACK;
```

#### API Debugging

```typescript
// lib/logger.ts
export function logAPICall(method: string, path: string, status: number, duration: number, error?: any) {
  console.log({
    timestamp: new Date().toISOString(),
    method,
    path,
    status,
    duration_ms: duration,
    error: error?.message,
  });
}

// Use in API routes
const startTime = Date.now();
try {
  // ... API logic
  logAPICall('GET', '/api/performance/daily/...', 200, Date.now() - startTime);
} catch (error) {
  logAPICall('GET', '/api/performance/daily/...', 500, Date.now() - startTime, error);
  throw error;
}
```

---

## Troubleshooting

### Common Issues

#### Issue: MView not refreshing

**Symptoms:**
- Stale data in dashboard
- `last_refreshed_at` timestamp not updating

**Diagnosis:**
```sql
SELECT * FROM cron.job_run_details WHERE jobname LIKE 'refresh%' ORDER BY start_time DESC LIMIT 10;
```

**Solutions:**
1. Check pg_cron extension enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Manually refresh: `SELECT refresh_daily_performance();`
3. Check for locks: `SELECT * FROM pg_locks WHERE relation::regclass::text LIKE '%daily_performance%';`
4. Verify cron schedule: `SELECT * FROM cron.job;`

---

#### Issue: COGS not calculated on POS sales

**Symptoms:**
- `pos_sales.cogs` is NULL
- No inventory transactions created

**Diagnosis:**
```sql
-- Check trigger enabled
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE 'process_sale%';

-- Check recipe_id is set
SELECT COUNT(*), COUNT(recipe_id) FROM pos_sales WHERE sale_timestamp > NOW() - INTERVAL '1 hour';

-- Test trigger manually
DO $$
BEGIN
  PERFORM process_sale_inventory() FROM pos_sales WHERE id = 'specific-sale-id';
END $$;
```

**Solutions:**
1. Verify `recipe_id` is set on POS sale
2. Check trigger enabled: `ALTER TABLE pos_sales ENABLE TRIGGER process_sale_inventory_trigger;`
3. Verify recipe has components: `SELECT * FROM recipe_components WHERE recipe_id = 'xxx';`
4. Check inventory balances exist: `SELECT * FROM inventory_balances WHERE item_id = 'xxx';`

---

#### Issue: Cost spike false positives

**Symptoms:**
- Too many cost spike alerts
- Alerts for normal price fluctuations

**Diagnosis:**
```sql
-- Check alert frequency
SELECT DATE(created_at), COUNT(*) FROM alerts WHERE alert_type = 'cost_spike' AND created_at > NOW() - INTERVAL '7 days' GROUP BY DATE(created_at);

-- Review z-scores
SELECT
  metadata->>'item_name' as item,
  AVG((metadata->>'z_score')::NUMERIC) as avg_z_score,
  MAX((metadata->>'z_score')::NUMERIC) as max_z_score
FROM alerts
WHERE alert_type = 'cost_spike' AND created_at > NOW() - INTERVAL '30 days'
GROUP BY metadata->>'item_name'
ORDER BY avg_z_score DESC;
```

**Solutions:**
1. Increase z-score threshold: Edit trigger function, change `IF ABS(v_z_score) > 2` to `> 2.5` or `> 3`
2. Increase historical window: Change `NOW() - INTERVAL '90 days'` to `'180 days'`
3. Add item-specific thresholds via `exception_rules`

---

#### Issue: Exception panel shows too many items

**Symptoms:**
- Exception dashboard overwhelming
- Managers ignoring alerts

**Diagnosis:**
```sql
-- Count exceptions by type
SELECT exception_type, severity, COUNT(*) FROM operational_exceptions GROUP BY exception_type, severity;

-- Review variance thresholds
SELECT * FROM exception_rules WHERE rule_category = 'variance';
```

**Solutions:**
1. Increase variance thresholds in `exception_rules`
2. Change severity levels (e.g., 'warning' → 'info' for less critical items)
3. Disable noisy rules: `UPDATE exception_rules SET is_active = false WHERE rule_name = 'xxx';`
4. Adjust budget targets in `daily_budgets`

---

#### Issue: Slow API response times

**Symptoms:**
- Dashboard loads slowly
- API timeouts

**Diagnosis:**
```sql
-- Check MView sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE tablename IN ('daily_performance', 'labor_efficiency_hourly', 'vendor_performance');

-- Find slow queries
SELECT query, mean_time, calls FROM pg_stat_statements WHERE mean_time > 500 ORDER BY mean_time DESC LIMIT 10;
```

**Solutions:**
1. Add missing indexes
2. Reduce MView data retention (change `WHERE ... >= CURRENT_DATE - INTERVAL '90 days'` to `'30 days'`)
3. Use real-time views only when necessary
4. Enable API response caching

---

#### Issue: Missing recipe IDs on POS sales

**Symptoms:**
- Low COGS calculation coverage
- Warning: "Missing recipe_id on X% of sales"

**Diagnosis:**
```sql
SELECT
  venue_id,
  item_name,
  COUNT(*) as sale_count,
  COUNT(recipe_id) as with_recipe,
  (COUNT(recipe_id)::FLOAT / COUNT(*)) * 100 as pct_mapped
FROM pos_sales
WHERE sale_timestamp > NOW() - INTERVAL '7 days'
GROUP BY venue_id, item_name
HAVING COUNT(recipe_id)::FLOAT / COUNT(*) < 0.5
ORDER BY sale_count DESC;
```

**Solutions:**
1. Create missing recipes: `INSERT INTO recipes (name, venue_id, category) VALUES (...);`
2. Map POS items to recipes via lookup table
3. Implement fuzzy matching in POS integration
4. Train staff to use consistent item names

---

### Rollback Procedures

#### Rollback Triggers

```sql
-- Disable inventory deduction
ALTER TABLE pos_sales DISABLE TRIGGER process_sale_inventory_trigger;
ALTER TABLE pos_sales DISABLE TRIGGER process_sale_inventory_update_trigger;

-- Disable cost spike detection
ALTER TABLE receipt_lines DISABLE TRIGGER detect_cost_spike_trigger;
ALTER TABLE invoice_lines DISABLE TRIGGER detect_invoice_cost_spike_trigger;
```

#### Rollback pg_cron Jobs

```sql
-- Stop all refresh jobs
SELECT cron.unschedule('refresh-labor-efficiency-hourly');
SELECT cron.unschedule('refresh-daily-performance-15min');
SELECT cron.unschedule('refresh-vendor-performance-daily');
SELECT cron.unschedule('cleanup-old-alerts');
SELECT cron.unschedule('cleanup-old-cost-history');
```

#### Rollback Migrations

```bash
# Rollback to before intelligence layer
npx supabase db reset --version 030

# OR rollback specific migration
npx supabase migration repair 043 --status reverted
```

#### Emergency Disable

If system is causing issues:

```sql
-- 1. Disable all triggers
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tgname, relname FROM pg_trigger JOIN pg_class ON tgrelid = oid
    WHERE tgname LIKE '%process_sale%' OR tgname LIKE '%detect_cost%'
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', r.relname, r.tgname);
  END LOOP;
END $$;

-- 2. Stop all cron jobs
SELECT cron.unschedule(jobname) FROM cron.job;

-- 3. Drop materialized views (will break dashboard)
DROP MATERIALIZED VIEW IF EXISTS daily_performance CASCADE;
DROP MATERIALIZED VIEW IF EXISTS labor_efficiency_hourly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS labor_efficiency_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS vendor_performance CASCADE;
```

---

## Future Roadmap

### Phase 3: Forecasting (Weeks 9-12)

**Goal:** Predict future sales and labor needs

**Features:**
- Prophet model for sales forecasting
- Labor requirements calculator
- Schedule optimization
- Budget forecasting

**Tech:**
- Python Prophet model
- Next.js API route bridge
- Forecasting cache layer

---

### Phase 4: Advanced Intelligence (Months 3-6)

**Goal:** ML-powered insights and automation

**Features:**
- Menu engineering recommendations
- Vendor optimization suggestions
- Theft/waste detection
- Predictive maintenance alerts

**Tech:**
- TensorFlow.js for client-side ML
- OpenAI embeddings for recipe similarity
- Anomaly detection algorithms

---

### Phase 5: Multi-Tenant SaaS (Months 6-12)

**Goal:** Scale beyond H.wood Group

**Features:**
- Self-service onboarding
- Custom integrations (Toast, Square, etc.)
- White-label dashboards
- Usage-based pricing

**Tech:**
- Stripe for billing
- Zapier/Make integrations
- Embedded analytics (Metabase)

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **COGS** | Cost of Goods Sold - direct cost of inventory used in a sale |
| **Prime Cost** | COGS + Labor Cost - the two largest controllable costs |
| **SPLH** | Sales Per Labor Hour - efficiency metric (revenue / labor hours) |
| **Labor Cost %** | Labor cost as percentage of sales revenue |
| **Par Level** | Target inventory quantity to maintain |
| **Reorder Point** | Inventory level triggering a purchase order |
| **Z-Score** | Statistical measure of how many standard deviations a value is from the mean |
| **MView** | Materialized View - cached query result that can be refreshed |
| **Exception-First** | Workflow showing only items requiring attention (not all data) |
| **Three-Way Match** | Verification that PO, Receipt, and Invoice all align |
| **Variance** | Difference between actual and budgeted performance |
| **RLS** | Row-Level Security - database access control per user |

---

### Contact & Support

**Technical Issues:**
- **Waseem Akhtar** (Tech Lead) - waseem@opsos.com
- GitHub Issues: https://github.com/shurehw/opsos/issues

**Business Logic:**
- **Harsh Aggerwal** (Finance Lead) - harsh@opsos.com

**Product Questions:**
- **Jacob Shure** (Founder) - jacob@opsos.com

**Project Management:**
- **Matt Perasso** (PM) - matt@opsos.com

---

### Additional Resources

**Documentation:**
- Test Suite: `supabase/tests/README.md`
- Integration Guide: `docs/OPSOS_MVP_INTEGRATION_GUIDE.md`
- API Routes: `app/api/*/route.ts`
- Migrations: `supabase/migrations/031-043_*.sql`

**External Docs:**
- Supabase: https://supabase.com/docs
- Next.js: https://nextjs.org/docs
- Claude API: https://docs.anthropic.com

---

**Document Version:** 1.0.0
**Last Updated:** November 10, 2025
**Status:** ✅ Intelligence Layer MVP Complete - Ready for Pilot Testing

---

## Quick Start Commands

```bash
# Setup
cd "c:\Users\JacobShure\RESTAURANT APP"
npm install

# Start development
npm run dev

# Run migrations
npx supabase db reset

# Run tests
npm run test:db

# Seed test data
npm run test:db:seed

# Manual MView refresh
psql $DATABASE_URL -c "SELECT refresh_daily_performance();"

# Check system health
psql $DATABASE_URL -c "SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;"
```

---

**End of Documentation**
