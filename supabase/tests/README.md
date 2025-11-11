# OpsOS Intelligence Layer - Test Suite

## Overview

This test suite validates all intelligence layer functions, triggers, and materialized views created in migrations 031-043.

## Test Architecture

```
supabase/tests/
├── fixtures/          # Test data fixtures
├── unit/             # Unit tests for individual functions
├── integration/      # Integration tests for workflows
└── helpers/          # Test utilities and helpers
```

## Test Categories

### 1. Recipe-Inventory Bridge (Migration 031)
- Recipe component CRUD operations
- Recipe cost calculation
- Multi-venue recipe costing

### 2. Budgets & Alerts (Migration 032)
- Daily budget management
- Alert creation and acknowledgment
- Alert rule evaluation

### 3. Inventory Deduction (Migration 035)
- POS sale → inventory deduction
- COGS calculation from recipe components
- Multi-component recipe handling

### 4. Cost Spike Detection (Migration 036)
- Z-score calculation for price variance
- Alert generation on >2σ variance
- Historical cost tracking

### 5. Labor Efficiency (Migration 037)
- Hourly labor metrics calculation
- SPLH (Sales Per Labor Hour)
- Labor cost percentage

### 6. Daily Performance (Migration 038)
- Daily P&L aggregation
- Prime cost calculation
- Real-time vs cached performance

### 7. Variance & Exceptions (Migration 039)
- Budget variance calculation
- Exception-first view filtering
- Severity level assignment

### 8. Vendor Performance (Migration 040)
- Vendor scorecard calculation
- On-time delivery tracking
- Auto-approval rate

### 9. Exception Rules (Migration 041)
- Rule evaluation engine
- Auto-approval logic
- Priority-based rule matching

### 10. Materialized View Refresh (Migration 042)
- Concurrent refresh without locks
- pg_cron job execution
- Manual refresh triggers

## Running Tests

### Prerequisites

```bash
# Ensure Supabase is running locally
npx supabase start

# Install dependencies
npm install
```

### Run All Tests

```bash
npm run test:db
```

### Run Specific Test Suite

```bash
# Unit tests only
npm run test:db:unit

# Integration tests only
npm run test:db:integration

# Specific migration tests
npm run test:db -- --filter=031
```

### Run Tests with Coverage

```bash
npm run test:db:coverage
```

## Test Data Management

### Seed Test Data

```bash
npm run test:db:seed
```

### Clean Test Data

```bash
npm run test:db:clean
```

### Reset Database

```bash
npx supabase db reset
```

## Writing Tests

### SQL Test Template

```sql
-- Test: [Description]
BEGIN;

-- Setup
INSERT INTO venues (id, name) VALUES ('test-venue-id', 'Test Venue');

-- Execute function
SELECT calculate_recipe_cost('recipe-id', 'venue-id');

-- Assert
SELECT tests.expect_equal(
  (SELECT total_cost FROM recipe_costs WHERE recipe_id = 'recipe-id' ORDER BY calculated_at DESC LIMIT 1),
  150.00,
  'Recipe cost should be $150'
);

ROLLBACK;
```

### TypeScript Test Template

```typescript
import { createClient } from '@/lib/supabase/server';

describe('Recipe Cost Calculation', () => {
  it('should calculate recipe cost correctly', async () => {
    const supabase = await createClient();

    // Arrange
    const { data: recipe } = await supabase
      .from('recipes')
      .insert({ name: 'Test Recipe' })
      .select()
      .single();

    // Act
    const { data, error } = await supabase
      .rpc('calculate_recipe_cost', {
        p_recipe_id: recipe.id
      });

    // Assert
    expect(error).toBeNull();
    expect(data).toBeGreaterThan(0);
  });
});
```

## CI/CD Integration

Tests run automatically on:
- Pull requests to `main` branch
- Pre-deployment to staging
- Nightly regression suite

## Troubleshooting

### Common Issues

**Issue**: `relation "recipe_components" does not exist`
**Solution**: Run migrations first: `npx supabase db reset`

**Issue**: `permission denied for function calculate_recipe_cost`
**Solution**: Check RLS policies and user permissions

**Issue**: `materialized view "daily_performance" has not been populated`
**Solution**: Run initial refresh: `SELECT refresh_daily_performance()`

## Test Coverage Goals

- Unit test coverage: >80%
- Integration test coverage: >60%
- Critical path coverage: 100%

## Performance Benchmarks

All tests should complete within:
- Unit tests: <100ms each
- Integration tests: <1s each
- Full suite: <5 minutes

## Reporting

Test results are output in:
- Console (for local development)
- JUnit XML (for CI/CD)
- HTML report (for detailed analysis)

## Contact

For questions about testing:
- Lead: Jacob Shure
- Tech Lead: Waseem Akhtar
- Testing: New Developer
