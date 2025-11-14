/**
 * Migration 058: Critical Performance Indexes
 * Purpose: Add indexes for frequently queried columns and foreign keys
 * Based on audit findings and common query patterns
 */

-- ============================================================================
-- INVENTORY & TRANSACTIONS
-- ============================================================================

-- Inventory balances: lookup by venue + item (most common query)
CREATE INDEX IF NOT EXISTS idx_inventory_balances_venue_item
  ON inventory_balances(venue_id, item_id);

-- Inventory transactions: filter by venue, date range, type
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_venue_date
  ON inventory_transactions(venue_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type
  ON inventory_transactions(transaction_type) WHERE transaction_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference
  ON inventory_transactions(reference_type, reference_id)
  WHERE reference_type IS NOT NULL;

-- ============================================================================
-- PURCHASE ORDERS & INVOICING
-- ============================================================================

-- Purchase orders: venue + vendor + date filtering
CREATE INDEX IF NOT EXISTS idx_purchase_orders_venue_vendor
  ON purchase_orders(venue_id, vendor_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date
  ON purchase_orders(order_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON purchase_orders(status) WHERE status IS NOT NULL;

-- Invoice lookup by number (for vendor statement matching)
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON invoices(invoice_number) WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_venue_vendor
  ON invoices(venue_id, vendor_id);

CREATE INDEX IF NOT EXISTS idx_invoices_date
  ON invoices(invoice_date DESC);

-- Invoice lines: join optimization
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id
  ON invoice_lines(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_item_id
  ON invoice_lines(item_id);

-- ============================================================================
-- RECIPES & COMPONENTS
-- ============================================================================

-- Recipe components: lookup by recipe (for COGS calculation)
CREATE INDEX IF NOT EXISTS idx_recipe_components_recipe_id
  ON recipe_components(recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_components_item_id
  ON recipe_components(item_id);

-- Recipe costs: venue + recipe lookup
CREATE INDEX IF NOT EXISTS idx_recipe_costs_venue_recipe
  ON recipe_costs(venue_id, recipe_id) WHERE venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_costs_calculated_at
  ON recipe_costs(calculated_at DESC);

-- ============================================================================
-- POS SALES
-- ============================================================================

-- POS sales: date range queries, revenue reports
CREATE INDEX IF NOT EXISTS idx_pos_sales_venue_timestamp
  ON pos_sales(venue_id, sale_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pos_sales_recipe_id
  ON pos_sales(recipe_id) WHERE recipe_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_sale_date
  ON pos_sales(venue_id, (sale_timestamp::DATE)) WHERE sale_timestamp IS NOT NULL;

-- ============================================================================
-- VENDOR STATEMENTS & MATCHING
-- ============================================================================

-- Vendor statements: venue + period lookup
CREATE INDEX IF NOT EXISTS idx_vendor_statements_venue_period
  ON vendor_statements(venue_id, statement_period_end DESC);

-- Vendor statement lines: matching queries
CREATE INDEX IF NOT EXISTS idx_vendor_statement_lines_statement_id
  ON vendor_statement_lines(vendor_statement_id);

CREATE INDEX IF NOT EXISTS idx_vendor_statement_lines_match_status
  ON vendor_statement_lines(match_status) WHERE match_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_statement_lines_invoice_number
  ON vendor_statement_lines(invoice_number) WHERE invoice_number IS NOT NULL;

-- ============================================================================
-- LABOR & TIME TRACKING
-- ============================================================================

-- Time clock punches: date range reporting
CREATE INDEX IF NOT EXISTS idx_time_clock_punches_venue_date
  ON time_clock_punches(venue_id, clock_in_time DESC);

CREATE INDEX IF NOT EXISTS idx_time_clock_punches_employee_id
  ON time_clock_punches(employee_id);

-- Shift assignments: schedule lookups
CREATE INDEX IF NOT EXISTS idx_shift_assignments_venue_date
  ON shift_assignments(venue_id, shift_date DESC);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_id
  ON shift_assignments(employee_id);

-- Labor forecasts: date range queries
CREATE INDEX IF NOT EXISTS idx_labor_forecasts_venue_date
  ON labor_forecasts(venue_id, forecast_date DESC);

-- ============================================================================
-- ALERTS & EXCEPTIONS
-- ============================================================================

-- Alerts: unacknowledged alerts dashboard
CREATE INDEX IF NOT EXISTS idx_alerts_venue_created
  ON alerts(venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged
  ON alerts(acknowledged) WHERE acknowledged = false;

CREATE INDEX IF NOT EXISTS idx_alerts_severity
  ON alerts(severity) WHERE severity IS NOT NULL;

-- ============================================================================
-- MESSAGING
-- ============================================================================

-- Messages: channel + timestamp (chat history)
CREATE INDEX IF NOT EXISTS idx_messages_channel_timestamp
  ON messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON messages(user_id);

-- ============================================================================
-- ORGANIZATION & USERS
-- ============================================================================

-- Organization users: user → orgs lookup
CREATE INDEX IF NOT EXISTS idx_organization_users_user_id
  ON organization_users(user_id);

-- Venues: org lookup
CREATE INDEX IF NOT EXISTS idx_venues_organization_id
  ON venues(organization_id);

-- ============================================================================
-- IDEMPOTENCY & RATE LIMITING
-- ============================================================================

-- HTTP idempotency: key lookup + cleanup
CREATE INDEX IF NOT EXISTS idx_http_idempotency_key
  ON http_idempotency(key);

-- Already created in migration 055:
-- CREATE INDEX IF NOT EXISTS idx_http_idempotency_expires_at
--   ON http_idempotency(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- FULL-TEXT SEARCH PREP (for future item search)
-- ============================================================================

-- Items: text search on name and SKU
CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON items USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_sku_trgm
  ON items USING gin(sku gin_trgm_ops);

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON INDEX idx_inventory_balances_venue_item IS 'Optimize inventory balance lookups';
COMMENT ON INDEX idx_pos_sales_venue_timestamp IS 'Optimize sales reporting queries';
COMMENT ON INDEX idx_vendor_statement_lines_match_status IS 'Optimize vendor reconciliation dashboard';
COMMENT ON INDEX idx_items_name_trgm IS 'Enable fuzzy text search on item names';
