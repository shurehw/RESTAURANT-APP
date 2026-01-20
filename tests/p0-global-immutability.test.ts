/**
 * P0 TEST 2: Global Rows Cannot Be Modified
 *
 * Verifies that rows with tenant_id IS NULL (global benchmarks)
 * cannot be modified or deleted by tenant admins
 */

import { describe, it, expect } from '@jest/globals';

describe('P0: Global Immutability Enforcement', () => {
  it('should return 403 GLOBAL_IMMUTABLE when attempting to PATCH global benchmark', async () => {
    // Get a global benchmark ID (tenant_id IS NULL)
    const listResponse = await fetch('http://localhost:3000/api/proforma/concept-benchmarks');
    const { benchmarks } = await listResponse.json();
    const globalBenchmark = benchmarks.find((b: any) => b.tenant_id === null);

    if (!globalBenchmark) {
      throw new Error('Test setup failed: No global benchmarks found in database');
    }

    // Attempt to update global benchmark
    const updateResponse = await fetch('http://localhost:3000/api/proforma/concept-benchmarks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: globalBenchmark.id,
        sf_per_seat_min: 999, // Try to modify
      }),
    });

    const body = await updateResponse.json();

    // P0 ASSERTION: Must block with 403 and GLOBAL_IMMUTABLE code
    expect(updateResponse.status).toBe(403);
    expect(body.code).toBe('GLOBAL_IMMUTABLE');
    expect(body.error).toContain('Cannot modify global benchmarks');
    expect(body.remediation).toContain('Create tenant-specific override');
    expect(body.action).toBe('create_tenant_override');
  });

  it('should return 403 GLOBAL_IMMUTABLE when attempting to DELETE global benchmark', async () => {
    const listResponse = await fetch('http://localhost:3000/api/proforma/concept-benchmarks');
    const { benchmarks } = await listResponse.json();
    const globalBenchmark = benchmarks.find((b: any) => b.tenant_id === null);

    if (!globalBenchmark) {
      throw new Error('Test setup failed: No global benchmarks found');
    }

    // Attempt to delete global benchmark
    const deleteResponse = await fetch(
      `http://localhost:3000/api/proforma/concept-benchmarks?id=${globalBenchmark.id}`,
      { method: 'DELETE' }
    );

    const body = await deleteResponse.json();

    // P0 ASSERTION: Must block deletion
    expect(deleteResponse.status).toBe(403);
    expect(body.code).toBe('GLOBAL_IMMUTABLE');
    expect(body.error).toContain('Cannot delete global benchmarks');
  });

  it('should allow PATCH of tenant-specific benchmarks', async () => {
    // Create a tenant-specific benchmark first
    const createResponse = await fetch('http://localhost:3000/api/proforma/concept-benchmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept_type: 'casual-dining',
        market_tier: 'MID',
        sf_per_seat_min: 18,
        sf_per_seat_max: 22,
        seats_per_1k_sf_min: 45,
        seats_per_1k_sf_max: 55,
        dining_area_pct_min: 60,
        dining_area_pct_max: 70,
      }),
    });

    const { benchmark } = await createResponse.json();

    // Now update it (should succeed because tenant_id is NOT NULL)
    const updateResponse = await fetch('http://localhost:3000/api/proforma/concept-benchmarks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: benchmark.id,
        sf_per_seat_min: 19, // Modify tenant-specific benchmark
      }),
    });

    // P0 ASSERTION: Tenant-specific benchmarks CAN be modified
    expect(updateResponse.status).toBe(200);
    const updatedBody = await updateResponse.json();
    expect(updatedBody.benchmark.sf_per_seat_min).toBe(19);
  });

  it('should allow DELETE of tenant-specific benchmarks', async () => {
    // Create and then delete tenant-specific benchmark
    const createResponse = await fetch('http://localhost:3000/api/proforma/concept-benchmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept_type: 'test-concept',
        market_tier: 'MID',
        sf_per_seat_min: 20,
        sf_per_seat_max: 25,
        seats_per_1k_sf_min: 40,
        seats_per_1k_sf_max: 50,
        dining_area_pct_min: 60,
        dining_area_pct_max: 70,
      }),
    });

    const { benchmark } = await createResponse.json();

    const deleteResponse = await fetch(
      `http://localhost:3000/api/proforma/concept-benchmarks?id=${benchmark.id}`,
      { method: 'DELETE' }
    );

    // P0 ASSERTION: Tenant-specific benchmarks CAN be deleted
    expect(deleteResponse.status).toBe(200);
  });
});

/**
 * MANUAL TEST SCRIPT
 *
 * To test manually:
 *
 * 1. Find a global benchmark ID:
 *    SELECT id, concept_type FROM proforma_concept_benchmarks
 *    WHERE tenant_id IS NULL LIMIT 1;
 *
 * 2. Attempt to update it:
 *    curl -X PATCH http://localhost:3000/api/proforma/concept-benchmarks \
 *      -H "Content-Type: application/json" \
 *      -H "Authorization: Bearer [token]" \
 *      -d '{"id":"[global-id]","sf_per_seat_min":999}'
 *
 * 3. Expected response:
 *    {
 *      "error": "Cannot modify global benchmarks. Create tenant-specific override instead.",
 *      "code": "GLOBAL_IMMUTABLE",
 *      "remediation": "Create a new benchmark for your organization...",
 *      "action": "create_tenant_override"
 *    }
 *    Status: 403
 *
 * 4. FAILURE if update succeeds (status 200)
 *
 * 5. Verify global row unchanged:
 *    SELECT sf_per_seat_min FROM proforma_concept_benchmarks WHERE id = '[global-id]';
 *    -- Should NOT be 999
 */
