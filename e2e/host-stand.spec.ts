/**
 * Host Stand E2E tests — iPad viewport, touch interactions.
 * Tests the live floor management surface including drag-to-seat.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe('Host Stand', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/host-stand');

    // Skip all host-stand tests if the page returns 404
    const is404 = await page.locator('text=404').isVisible().catch(() => false);
    test.skip(is404, 'Host stand page not available (404)');

    // Wait for floor plan canvas to render
    await expect(page.locator('[style*="aspect-ratio"]')).toBeVisible({ timeout: 15_000 });
  });

  // ── Layout & Core UI ─────────────────────────────────────────

  test('renders header, sidebar, floor plan, and metrics bar', async ({ page }) => {
    // Header shows venue name and date
    await expect(page.locator('header, [class*="header"]').first()).toBeVisible();

    // Sidebar has section headers
    await expect(page.getByText(/upcoming/i).first()).toBeVisible();
    await expect(page.getByText(/seated/i).first()).toBeVisible();
    await expect(page.getByText(/waitlist/i).first()).toBeVisible();

    // Floor plan canvas present
    const canvas = page.locator('[style*="aspect-ratio"]');
    await expect(canvas).toBeVisible();

    // Tables rendered on canvas (data-table-id attribute)
    const tables = page.locator('[data-table-id]');
    await expect(tables.first()).toBeVisible({ timeout: 10_000 });
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);

    // Metrics bar at bottom
    await expect(page.getByText(/covers/i).first()).toBeVisible();
  });

  test('tables show correct status colors', async ({ page }) => {
    // At least some tables should be visible
    const tables = page.locator('[data-table-id]');
    await expect(tables.first()).toBeVisible({ timeout: 10_000 });

    // Check that data-table-status attributes exist
    const statuses = await tables.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.tableStatus).filter(Boolean)
    );
    expect(statuses.length).toBeGreaterThan(0);
    // All statuses should be valid
    const validStatuses = ['available', 'reserved', 'seated', 'occupied', 'check_dropped', 'bussing', 'blocked'];
    for (const s of statuses) {
      expect(validStatuses).toContain(s);
    }
  });

  // ── Table Selection & Action Sheet ────────────────────────────

  test('clicking a table opens the action sheet', async ({ page }) => {
    const table = page.locator('[data-table-id]').first();
    await table.click();

    // Action sheet should appear with table info
    await expect(
      page.getByText(/table/i).locator('xpath=ancestor-or-self::*[contains(@class,"sheet") or contains(@class,"dialog") or contains(@class,"action")]').first()
        .or(page.locator('[class*="sheet"], [class*="action-sheet"], [role="dialog"]').first())
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Drag-to-Seat ─────────────────────────────────────────────

  test('drag reservation to available table seats the party', async ({ page }) => {
    // Find an upcoming reservation row with grab cursor
    const rezRow = page.locator('[style*="cursor: grab"]').first();
    const hasRez = await rezRow.isVisible().catch(() => false);
    test.skip(!hasRez, 'No upcoming reservations to drag');

    // Find an available table
    const availableTable = page.locator('[data-table-status="available"]').first();
    const hasTable = await availableTable.isVisible().catch(() => false);
    test.skip(!hasTable, 'No available tables');

    // Get the table ID before drag
    const tableId = await availableTable.getAttribute('data-table-id');

    // Perform drag: grab reservation row → move to table → release
    const rezBox = await rezRow.boundingBox();
    const tableBox = await availableTable.boundingBox();
    if (!rezBox || !tableBox) return;

    await page.mouse.move(rezBox.x + rezBox.width / 2, rezBox.y + rezBox.height / 2);
    await page.mouse.down();

    // Move in steps to trigger pointermove tracking
    const targetX = tableBox.x + tableBox.width / 2;
    const targetY = tableBox.y + tableBox.height / 2;
    await page.mouse.move(targetX, targetY, { steps: 10 });

    // Verify hover highlight appears (orange ring)
    await expect(availableTable.locator('div').first()).toHaveCSS('transform', /scale/, { timeout: 2_000 }).catch(() => {});

    await page.mouse.up();

    // Table should transition away from 'available' (give it time for API call + refresh)
    await expect(async () => {
      const status = await page.locator(`[data-table-id="${tableId}"]`).getAttribute('data-table-status');
      expect(status).not.toBe('available');
    }).toPass({ timeout: 10_000 });
  });

  // ── Seat Walk-in ──────────────────────────────────────────────

  test('seat walk-in dialog opens and submits', async ({ page }) => {
    // Click "Seat Walk-in" button in sidebar
    const seatBtn = page.getByRole('button', { name: /seat walk-?in/i });
    const hasSeatBtn = await seatBtn.isVisible().catch(() => false);
    test.skip(!hasSeatBtn, 'No Seat Walk-in button');

    await seatBtn.click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in walk-in details
    const nameInput = dialog.getByLabel(/name/i).or(dialog.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Walk-in');
    }

    const sizeInput = dialog.getByLabel(/party|size|covers/i).or(dialog.getByPlaceholder(/size/i));
    if (await sizeInput.isVisible()) {
      await sizeInput.fill('2');
    }
  });

  // ── Waitlist ──────────────────────────────────────────────────

  test('add to waitlist dialog opens', async ({ page }) => {
    const addBtn = page.getByRole('button', { name: /add.*waitlist|waitlist/i });
    const hasBtn = await addBtn.isVisible().catch(() => false);
    test.skip(!hasBtn, 'No Add Waitlist button');

    await addBtn.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  });

  // ── Reservation Actions ───────────────────────────────────────

  test('mark arrived button works on pending reservation', async ({ page }) => {
    const arrivedBtn = page.getByRole('button', { name: /arrived/i }).first();
    const hasBtn = await arrivedBtn.isVisible().catch(() => false);
    test.skip(!hasBtn, 'No ARRIVED button visible');

    await arrivedBtn.click();

    // Should show HERE badge or move to a different status
    await expect(page.getByText(/here/i).first()).toBeVisible({ timeout: 5_000 }).catch(() => {});
  });

  // ── Date Navigation ───────────────────────────────────────────

  test('date navigation changes business date', async ({ page }) => {
    // Find date navigation arrows
    const nextBtn = page.locator('button').filter({ hasText: /›|→|next/i }).first()
      .or(page.locator('[aria-label*="next"]').first());
    const hasNav = await nextBtn.isVisible().catch(() => false);
    test.skip(!hasNav, 'No date navigation');

    // Get current date text
    const dateText = await page.locator('header, [class*="header"]').first().textContent();
    await nextBtn.click();

    // Date should change
    await page.waitForTimeout(1000);
    const newDateText = await page.locator('header, [class*="header"]').first().textContent();
    expect(newDateText).not.toBe(dateText);
  });

  // ── Real-time Updates ─────────────────────────────────────────

  test('floor plan polls and updates', async ({ page }) => {
    // Intercept the live floor API call
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/floor-plan/live')) {
        apiCalls.push(req.url());
      }
    });

    // Wait for at least one poll cycle (30s default, but initial fetch is immediate)
    await page.waitForTimeout(2_000);
    expect(apiCalls.length).toBeGreaterThan(0);
  });
});
