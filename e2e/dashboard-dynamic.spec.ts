import { test, expect, type Page } from '@playwright/test';

async function skipIfOnLogin(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
}

test.describe('Dashboard Dynamic Routes', () => {
  test('vendors list opens a real vendor detail page', async ({ page }) => {
    await page.goto('/vendors');
    await skipIfOnLogin(page);

    const vendorLink = page.locator('table tbody tr a[href^="/vendors/"]').first();
    const hasVendor = await vendorLink.isVisible().catch(() => false);
    test.skip(!hasVendor, 'No vendor rows available');

    const href = await vendorLink.getAttribute('href');
    test.skip(!href, 'Vendor link missing href');
    await page.goto(href);
    await expect(page).toHaveURL(/\/vendors\/[^/]+$/);
    await expect(page.getByText(/back to vendors/i)).toBeVisible();
    await expect(page.getByText(/profile & banking/i)).toBeVisible();
  });

  test('orders list opens a real order detail page', async ({ page }) => {
    await page.goto('/orders');
    await skipIfOnLogin(page);

    const viewButton = page.getByRole('button', { name: /view/i }).first();
    const hasOrder = await viewButton.isVisible().catch(() => false);
    test.skip(!hasOrder, 'No order rows available');

    await viewButton.click();
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(page.getByText(/back to orders/i)).toBeVisible();
    await expect(page.getByText(/line items/i)).toBeVisible();
  });

  test('recipes list opens either an existing recipe editor or the new recipe builder', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    const editLink = page.locator('a[href^="/recipes/"]').filter({ hasText: /edit/i }).first();
    const hasRecipe = await editLink.isVisible().catch(() => false);

    if (hasRecipe) {
      const href = await editLink.getAttribute('href');
      test.skip(!href, 'Recipe edit link missing href');
      await page.goto(href);
      await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
      await expect(page.getByText(/back to recipes/i)).toBeVisible();
      return;
    }

    const newRecipeLink = page.locator('a[href="/recipes/new"]').first();
    await expect(newRecipeLink).toBeVisible();
    await newRecipeLink.click();
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(page.getByText(/new recipe|recipe information/i)).toBeVisible();
  });

  test('invoices list opens a real invoice review page', async ({ page }) => {
    await page.goto('/invoices');
    await skipIfOnLogin(page);

    const reviewLink = page.locator('table tbody tr a[href^="/invoices/"][href$="/review"]').first();
    const hasInvoice = await reviewLink.isVisible().catch(() => false);
    test.skip(!hasInvoice, 'No invoice rows available');

    const href = await reviewLink.getAttribute('href');
    test.skip(!href, 'Invoice review link missing href');
    await page.goto(href);
    await expect(page).toHaveURL(/\/invoices\/[^/]+\/review$/);
    await expect(page.getByText(/review invoice/i)).toBeVisible();
    await expect(page.getByText(/mapping progress/i)).toBeVisible();
  });
});
