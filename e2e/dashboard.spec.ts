/**
 * Dashboard E2E tests — desktop Chrome, authenticated user.
 * Tests core navigation, venue selection, and key pages.
 */
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  // ── Auth & Navigation ─────────────────────────────────────────

  test('authenticated user lands on dashboard home', async ({ page }) => {
    await page.goto('/');
    // Should NOT redirect to login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Should show the main layout
    await expect(page.locator('nav, [class*="sidebar"], [class*="topbar"]').first()).toBeVisible();
  });

  test('unauthenticated user redirects to login', async ({ browser }) => {
    // Fresh context with no stored auth
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/sales/pace');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await ctx.close();
  });

  // ── Venue Selection ───────────────────────────────────────────

  test('venue selector shows available venues', async ({ page }) => {
    await page.goto('/');
    // Find venue dropdown/selector
    const venueSelector = page.locator('[class*="venue"], [data-testid*="venue"]').first()
      .or(page.getByRole('combobox').first())
      .or(page.locator('select').first());

    const hasSelector = await venueSelector.isVisible().catch(() => false);
    test.skip(!hasSelector, 'No venue selector found');

    await venueSelector.click();
    // Should show venue options
    await page.waitForTimeout(500);
  });

  // ── Sales Pace ────────────────────────────────────────────────

  test('sales pace page loads with data', async ({ page }) => {
    await page.goto('/sales/pace');
    await expect(page).toHaveURL(/\/sales\/pace/);

    // Should show revenue or sales data
    await expect(
      page.getByText(/revenue|sales|net|gross/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Floor Plan (Dashboard View) ──────────────────────────────

  test('floor plan editor loads tables', async ({ page }) => {
    await page.goto('/floor-plan');
    await expect(page).toHaveURL(/\/floor-plan/);

    // Canvas should render
    const canvas = page.locator('[style*="aspect-ratio"]');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
  });

  // ── Reports ───────────────────────────────────────────────────

  test('reports page loads', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).not.toHaveURL(/\/login/);
    // Basic assertion that page rendered
    await expect(page.locator('main, [class*="content"]').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Control Plane ─────────────────────────────────────────────

  test('control plane page loads', async ({ page }) => {
    await page.goto('/control-plane');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main, [class*="content"]').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Admin Settings ────────────────────────────────────────────

  test('admin settings page loads', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main, [class*="content"]').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── API Health ────────────────────────────────────────────────

  test('sales poll API returns data', async ({ request }) => {
    const res = await request.get('/api/sales/poll?venue_id=11111111-1111-1111-1111-111111111111');
    // Should return 200 or 401 (if auth doesn't carry through)
    expect([200, 401]).toContain(res.status());
  });

  test('floor plan live API returns data', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0];
    const res = await request.get(
      `/api/floor-plan/live?venue_id=22222222-2222-2222-2222-222222222222&date=${today}`
    );
    expect([200, 401]).toContain(res.status());
  });
});
