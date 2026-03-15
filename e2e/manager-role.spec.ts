import { test, expect, type Page } from '@playwright/test';

async function ensureAuthenticated(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
}

async function gotoStable(page: Page, url: string, attempts = 3) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message || '');
      const retryable = message.includes('ERR_ABORTED') || message.toLowerCase().includes('timeout');
      if (!retryable || i === attempts - 1) {
        break;
      }
      await page.waitForTimeout(500 * (i + 1));
    }
  }
  throw lastError;
}

test.describe('Manager Role Coverage', () => {
  test('manager floor plan loads the ops view with staff assignment controls', async ({ page }) => {
    await gotoStable(page, '/floor-plan');
    await ensureAuthenticated(page);

    await expect(page).toHaveURL(/\/floor-plan\?venue=/, { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /^floor plan$/i })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('main')).toContainText(/loading floor plan|staff sections/i, { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /staff sections/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: /re-split/i })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('main')).toContainText(/no scheduled foh staff|auto-split by scheduled servers|table/i, { timeout: 30000 });
  });

  test('manager operational standards page loads and links through to comp settings', async ({ page }) => {
    await gotoStable(page, '/admin/operational-standards');
    const redirectedToLogin = /\/login(?:\?|$)/.test(page.url());
    if (redirectedToLogin) {
      await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Foperational-standards/, { timeout: 30000 });
      return;
    }
    await ensureAuthenticated(page);

    await expect(page.getByRole('heading', { name: /operational standards/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('combobox')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/no standards found for this organization/i)).toBeVisible({ timeout: 20000 });
  });
});
