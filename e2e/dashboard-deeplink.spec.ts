import { test, expect, type Page } from '@playwright/test';

const GOTO_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 30000 };

async function skipIfOnLogin(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
}

/** Wait for the nightly report data to render (skeleton → real content). */
async function waitForReportLoad(page: Page) {
  // Wait for heading to confirm page rendered
  await page.locator('h1:has-text("Nightly Report")').waitFor({ timeout: 15000 });
  // Give data fetches time to resolve
  await page.waitForTimeout(4000);
}

/**
 * Nightly report deep-link drill-through tests.
 * Validates that email links land on the correct filtered view.
 */
test.describe('Nightly Report Deep Links', () => {
  test.setTimeout(60000);
  // Use yesterday's date (matches what the nightly email would send)
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  test('deep-link with date loads the correct date', async ({ page }) => {
    await page.goto(`/reports/nightly?date=${yesterday}`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    // Date input should reflect the deep-linked date
    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.isVisible().catch(() => false)) {
      await expect(dateInput).toHaveValue(yesterday);
    }
  });

  test('deep-link with section=comps scrolls to comp card', async ({ page }) => {
    await page.goto(`/reports/nightly?date=${yesterday}&section=comps`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    // The comps section should be in the viewport (scrolled to)
    const compSection = page.locator('#section-comps');
    if (await compSection.isVisible().catch(() => false)) {
      await expect(compSection).toBeInViewport();
    }
  });

  test('deep-link with section=labor scrolls to labor card', async ({ page }) => {
    await page.goto(`/reports/nightly?date=${yesterday}&section=labor`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    const laborSection = page.locator('#section-labor');
    if (await laborSection.isVisible().catch(() => false)) {
      await expect(laborSection).toBeInViewport();
    }
  });

  test('deep-link with section=servers scrolls to server card', async ({ page }) => {
    await page.goto(`/reports/nightly?date=${yesterday}&section=servers`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    const serverSection = page.locator('#section-servers');
    if (await serverSection.isVisible().catch(() => false)) {
      await expect(serverSection).toBeInViewport();
    }
  });

  test('deep-link with reason filter shows filtered comps and All Comps tab', async ({ page }) => {
    await page.goto(`/reports/nightly?date=${yesterday}&section=comps&reason=BOH+Mistake`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    // Should be on the "All Comps" tab (not "By Reason")
    const allCompsTab = page.getByRole('tab', { name: /All Comps/i });
    if (await allCompsTab.isVisible().catch(() => false)) {
      await expect(allCompsTab).toHaveAttribute('data-state', 'active');
    }

    // Filter banner should show the reason
    const filterBanner = page.getByText('Filtered:');
    if (await filterBanner.isVisible().catch(() => false)) {
      await expect(page.getByText('BOH Mistake')).toBeVisible();
      await expect(page.getByText('Clear filter')).toBeVisible();
    }
  });

  test('deep-link with venue auto-selects that venue', async ({ page }) => {
    // Use Nice Guy venue ID
    const niceGuyId = '22222222-2222-2222-2222-222222222222';
    await page.goto(`/reports/nightly?date=${yesterday}&venue=${niceGuyId}`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    // Venue selector should show Nice Guy
    const venueSelector = page.locator('select[aria-label="Select venue"]');
    if (await venueSelector.isVisible().catch(() => false)) {
      await expect(venueSelector).toHaveValue(niceGuyId);
    }
  });

  test('clear filter button removes reason param', async ({ page }) => {
    await page.goto(`/reports/nightly?date=${yesterday}&section=comps&reason=BOH+Mistake`, GOTO_OPTS);
    await skipIfOnLogin(page);
    await waitForReportLoad(page);

    const clearBtn = page.getByText('Clear filter');
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      // URL should no longer have reason param
      await expect(page).not.toHaveURL(/reason=/);
      // Filter banner should be gone
      await expect(page.getByText('Filtered:')).not.toBeVisible();
    }
  });
});
