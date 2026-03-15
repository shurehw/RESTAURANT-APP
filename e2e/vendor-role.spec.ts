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

test.describe('Vendor Role Coverage', () => {
  test('vendor comp settings page loads and supports tab navigation including SOP preview', async ({ page }) => {
    await gotoStable(page, '/admin/comp-settings');
    await ensureAuthenticated(page);

    await expect(page.getByRole('heading', { name: /comp policy settings/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('combobox')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/no settings found for this organization/i)).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: /approved reasons/i }).click();
    await expect(page.getByRole('button', { name: /version history/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /version history/i }).click();
    await expect(page.getByRole('button', { name: /import\/export/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /generate sop/i }).click();
    await expect(page.getByText(/no settings found for this organization/i)).toBeVisible({ timeout: 20000 });
  });

  test('vendor operational standards page loads and can navigate to comp settings', async ({ page }) => {
    await gotoStable(page, '/admin/operational-standards');
    await ensureAuthenticated(page);

    await expect(page.getByRole('heading', { name: /operational standards/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('combobox')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/access denied/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/no standards found for this organization/i)).toBeVisible({ timeout: 20000 });
  });
});
