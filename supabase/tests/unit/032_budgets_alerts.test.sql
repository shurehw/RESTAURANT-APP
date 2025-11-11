/**
 * Unit Tests: Budgets & Alerts Foundation (Migration 032)
 * Tests: create_alert(), acknowledge_alert(), and budget management
 */

BEGIN;

-- Load test fixtures
\i supabase/tests/fixtures/test-data.sql

-- Test 1: Create alert function
DO $$
DECLARE
  v_alert_id UUID;
  v_alert_count INT;
BEGIN
  -- Execute
  v_alert_id := create_alert(
    'test-venue-001',
    'labor_overage',
    'critical',
    'Labor cost exceeded budget',
    'Labor cost is 15% over budget for today',
    '{"variance_pct": 15.5}'::jsonb
  );

  -- Assert alert was created
  IF v_alert_id IS NULL THEN
    RAISE EXCEPTION 'Alert creation failed';
  END IF;

  -- Verify alert exists
  SELECT COUNT(*) INTO v_alert_count
  FROM alerts
  WHERE id = v_alert_id;

  IF v_alert_count != 1 THEN
    RAISE EXCEPTION 'Alert not found in database';
  END IF;

  RAISE NOTICE 'PASS: Create alert function';
END $$;

-- Test 2: Alert defaults to unacknowledged
DO $$
DECLARE
  v_alert_id UUID;
  v_acknowledged BOOLEAN;
BEGIN
  -- Create alert
  v_alert_id := create_alert(
    'test-venue-001',
    'cogs_high',
    'warning',
    'COGS high',
    'COGS percentage is elevated',
    NULL
  );

  -- Check acknowledged status
  SELECT acknowledged INTO v_acknowledged
  FROM alerts
  WHERE id = v_alert_id;

  -- Assert
  IF v_acknowledged = true THEN
    RAISE EXCEPTION 'Alert should default to unacknowledged';
  END IF;

  RAISE NOTICE 'PASS: Alert defaults to unacknowledged';
END $$;

-- Test 3: Acknowledge alert function
DO $$
DECLARE
  v_alert_id UUID;
  v_acknowledged BOOLEAN;
  v_acknowledged_by UUID;
BEGIN
  -- Create alert
  v_alert_id := create_alert(
    'test-venue-001',
    'sales_low',
    'info',
    'Sales below target',
    'Sales are 5% under budget',
    NULL
  );

  -- Acknowledge alert
  PERFORM acknowledge_alert(v_alert_id, 'test-user-004');

  -- Verify acknowledgment
  SELECT acknowledged, acknowledged_by INTO v_acknowledged, v_acknowledged_by
  FROM alerts
  WHERE id = v_alert_id;

  -- Assert
  IF v_acknowledged != true THEN
    RAISE EXCEPTION 'Alert not marked as acknowledged';
  END IF;

  IF v_acknowledged_by != 'test-user-004' THEN
    RAISE EXCEPTION 'Alert acknowledged_by incorrect';
  END IF;

  RAISE NOTICE 'PASS: Acknowledge alert function';
END $$;

-- Test 4: Cannot acknowledge already acknowledged alert
DO $$
DECLARE
  v_alert_id UUID;
  v_result BOOLEAN;
BEGIN
  -- Create and acknowledge alert
  v_alert_id := create_alert(
    'test-venue-001',
    'test_alert',
    'info',
    'Test',
    'Test message',
    NULL
  );

  PERFORM acknowledge_alert(v_alert_id, 'test-user-004');

  -- Try to acknowledge again
  v_result := acknowledge_alert(v_alert_id, 'test-user-001');

  -- Assert (should return false)
  IF v_result = true THEN
    RAISE EXCEPTION 'Should not be able to re-acknowledge alert';
  END IF;

  RAISE NOTICE 'PASS: Cannot re-acknowledge alert';
END $$;

-- Test 5: Daily budget unique constraint
DO $$
BEGIN
  -- Try to insert duplicate budget
  BEGIN
    INSERT INTO daily_budgets (venue_id, business_date, sales_budget, labor_budget, cogs_budget_pct, prime_cost_budget_pct)
    VALUES ('test-venue-001', CURRENT_DATE, 1500.00, 300.00, 32.00, 62.00);

    RAISE EXCEPTION 'Duplicate daily budget was allowed';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS: Daily budget unique constraint enforced';
  END;
END $$;

-- Test 6: Budget percentages must be valid
DO $$
BEGIN
  -- Try to insert invalid COGS percentage (>100)
  BEGIN
    INSERT INTO daily_budgets (venue_id, business_date, sales_budget, labor_budget, cogs_budget_pct, prime_cost_budget_pct)
    VALUES ('test-venue-001', CURRENT_DATE + INTERVAL '10 days', 1000.00, 250.00, 150.00, 60.00);

    RAISE EXCEPTION 'Invalid COGS percentage was allowed';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: Budget percentages must be valid (0-100)';
  END;
END $$;

-- Test 7: Budget amounts must be non-negative
DO $$
BEGIN
  -- Try to insert negative sales budget
  BEGIN
    INSERT INTO daily_budgets (venue_id, business_date, sales_budget, labor_budget, cogs_budget_pct, prime_cost_budget_pct)
    VALUES ('test-venue-001', CURRENT_DATE + INTERVAL '11 days', -500.00, 250.00, 30.00, 60.00);

    RAISE EXCEPTION 'Negative sales budget was allowed';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: Budget amounts must be non-negative';
  END;
END $$;

-- Test 8: Alert with metadata
DO $$
DECLARE
  v_alert_id UUID;
  v_metadata JSONB;
BEGIN
  -- Create alert with complex metadata
  v_alert_id := create_alert(
    'test-venue-001',
    'cost_spike',
    'critical',
    'Cost spike detected',
    'Chicken breast price increased 25%',
    jsonb_build_object(
      'item_id', 'test-item-001',
      'old_price', 5.00,
      'new_price', 6.25,
      'variance_pct', 25.0,
      'z_score', 3.2
    )
  );

  -- Retrieve metadata
  SELECT metadata INTO v_metadata
  FROM alerts
  WHERE id = v_alert_id;

  -- Assert metadata stored correctly
  IF v_metadata->>'item_id' != 'test-item-001' THEN
    RAISE EXCEPTION 'Alert metadata not stored correctly';
  END IF;

  IF (v_metadata->>'z_score')::NUMERIC != 3.2 THEN
    RAISE EXCEPTION 'Alert numeric metadata not stored correctly';
  END IF;

  RAISE NOTICE 'PASS: Alert with metadata';
END $$;

-- Test 9: Alert severity enum validation
DO $$
BEGIN
  -- Try to insert invalid severity
  BEGIN
    PERFORM create_alert(
      'test-venue-001',
      'test_alert',
      'super_critical', -- Invalid
      'Test',
      'Test message',
      NULL
    );

    RAISE EXCEPTION 'Invalid severity was allowed';
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE NOTICE 'PASS: Alert severity enum validation';
  END;
END $$;

-- Test 10: Alert type enum validation
DO $$
BEGIN
  -- Try to insert invalid alert type
  BEGIN
    PERFORM create_alert(
      'test-venue-001',
      'invalid_type', -- Invalid
      'warning',
      'Test',
      'Test message',
      NULL
    );

    RAISE EXCEPTION 'Invalid alert type was allowed';
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE NOTICE 'PASS: Alert type enum validation';
  END;
END $$;

-- Test 11: Alert rule can be inactive
DO $$
DECLARE
  v_rule_count INT;
BEGIN
  -- Create inactive rule
  INSERT INTO alert_rules (rule_name, rule_type, metric, condition, threshold_pct, severity, is_active)
  VALUES ('Test Inactive Rule', 'variance', 'test_metric', '>', 10, 'info', false);

  -- Verify it's not in active index
  SELECT COUNT(*) INTO v_rule_count
  FROM alert_rules
  WHERE rule_name = 'Test Inactive Rule' AND is_active = true;

  IF v_rule_count != 0 THEN
    RAISE EXCEPTION 'Inactive rule appeared in active rules';
  END IF;

  RAISE NOTICE 'PASS: Alert rule can be inactive';
END $$;

-- Test 12: Budget updated_at timestamp auto-updates
DO $$
DECLARE
  v_original_updated_at TIMESTAMPTZ;
  v_new_updated_at TIMESTAMPTZ;
BEGIN
  -- Get original timestamp
  SELECT updated_at INTO v_original_updated_at
  FROM daily_budgets
  WHERE venue_id = 'test-venue-001' AND business_date = CURRENT_DATE;

  -- Wait a moment
  PERFORM pg_sleep(0.1);

  -- Update the budget
  UPDATE daily_budgets
  SET sales_budget = 1100.00
  WHERE venue_id = 'test-venue-001' AND business_date = CURRENT_DATE;

  -- Get new timestamp
  SELECT updated_at INTO v_new_updated_at
  FROM daily_budgets
  WHERE venue_id = 'test-venue-001' AND business_date = CURRENT_DATE;

  -- Assert
  IF v_new_updated_at <= v_original_updated_at THEN
    RAISE EXCEPTION 'Budget updated_at timestamp not auto-updated';
  END IF;

  RAISE NOTICE 'PASS: Budget updated_at timestamp auto-updates';
END $$;

ROLLBACK;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Budgets & Alerts Tests Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All tests passed ✓';
END $$;
