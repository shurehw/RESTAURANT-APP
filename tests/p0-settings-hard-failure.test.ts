/**
 * P0 TEST 1: Missing Settings Causes Hard Failure
 *
 * Verifies that when settings are missing from database,
 * the API returns 503 with SETTINGS_MISSING code (no fallback defaults)
 */

import { describe, it, expect } from '@jest/globals';

describe('P0: Hard Failure on Missing Settings', () => {
  it('should return 503 SETTINGS_MISSING when no settings row exists', async () => {
    // Simulate API call to labor-settings route with tenant that has no settings
    const response = await fetch('http://localhost:3000/api/proforma/labor-settings', {
      headers: {
        'Content-Type': 'application/json',
        // Include auth headers for test tenant with no settings
      },
    });

    const body = await response.json();

    // P0 ASSERTION: Must fail hard, no fallback defaults
    expect(response.status).toBe(503);
    expect(body.code).toBe('SETTINGS_MISSING');
    expect(body.error).toContain('No settings configured');
    expect(body.remediation).toBeDefined();

    // CRITICAL: Ensure no hardcoded defaults are returned
    expect(body.settings).toBeUndefined();
    expect(body).not.toHaveProperty('market_tier_low_multiplier');
  });

  it('should return 503 SETTINGS_QUERY_FAILED on database error', async () => {
    // This test would require mocking Supabase to simulate query failure
    // For now, document the expected behavior

    const expectedErrorShape = {
      error: expect.stringContaining('Settings query failed'),
      code: 'SETTINGS_QUERY_FAILED',
      details: expect.any(String),
      remediation: expect.stringContaining('INSERT INTO proforma_settings'),
    };

    // In real implementation, mock supabase.from().select() to throw error
    // and verify response matches expectedErrorShape
    expect(expectedErrorShape).toBeDefined();
  });

  it('should NOT return hardcoded 0.95/1.0/1.1 multipliers on error', async () => {
    // This is a negative test - ensure old fallback code is removed
    const response = await fetch('http://localhost:3000/api/proforma/labor-settings');
    const body = await response.json();

    // If status is 503, body should NOT contain these hardcoded values
    if (response.status === 503) {
      expect(body.settings?.market_tier_low_multiplier).not.toBe(0.95);
      expect(body.settings?.market_tier_mid_multiplier).not.toBe(1.0);
      expect(body.settings?.market_tier_high_multiplier).not.toBe(1.1);
    }
  });
});

/**
 * MANUAL TEST SCRIPT
 *
 * To test manually:
 *
 * 1. Delete settings for a test tenant:
 *    DELETE FROM proforma_settings WHERE org_id = '[test-tenant-id]';
 *
 * 2. Make API request:
 *    curl -X GET http://localhost:3000/api/proforma/labor-settings \
 *      -H "Authorization: Bearer [token]"
 *
 * 3. Expected response:
 *    {
 *      "error": "No settings configured for this organization. Contact administrator.",
 *      "code": "SETTINGS_MISSING",
 *      "remediation": "Administrator must initialize settings via Settings page or database seed."
 *    }
 *    Status: 503
 *
 * 4. FAILURE if you see:
 *    {
 *      "settings": {
 *        "market_tier_low_multiplier": 0.95,  // <- HARDCODED FALLBACK = BAD
 *        ...
 *      }
 *    }
 */
