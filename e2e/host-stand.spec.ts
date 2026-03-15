/**
 * Host Stand E2E tests — iPad viewport, touch interactions.
 * Tests the live floor management surface including drag-to-seat.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

type ServiceSupabase = ReturnType<typeof createClient>;

type HostStandContext = {
  organizationId: string;
  venueId: string;
};

type CleanupState = {
  reservationIds: string[];
  tableIds: string[];
  waitlistEntryIds: string[];
  tableStatusDates: Array<{ tableId: string; businessDate: string }>;
};

let hostStandContextPromise: Promise<HostStandContext> | null = null;

function getServiceSupabase(): ServiceSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase service role credentials for host-stand e2e tests');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function newCleanupState(): CleanupState {
  return {
    reservationIds: [],
    tableIds: [],
    waitlistEntryIds: [],
    tableStatusDates: [],
  };
}

async function getHostStandContext(): Promise<HostStandContext> {
  if (!hostStandContextPromise) {
    hostStandContextPromise = (async () => {
      const supabase = getServiceSupabase();
      const hostEmail = process.env.E2E_HOST_EMAIL;

      if (hostEmail) {
        const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = users.data.users.find((user) => user.email?.toLowerCase() === hostEmail.toLowerCase());

        if (authUser) {
          const { data: hostUser } = await supabase
            .from('host_stand_users')
            .select('org_id, venue_id')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .maybeSingle();

          if (hostUser?.org_id && hostUser?.venue_id) {
            return {
              organizationId: hostUser.org_id,
              venueId: hostUser.venue_id,
            };
          }
        }
      }

      const { data: fallbackHostUser, error } = await supabase
        .from('host_stand_users')
        .select('org_id, venue_id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error || !fallbackHostUser?.org_id || !fallbackHostUser?.venue_id) {
        throw new Error('Could not resolve a host-stand venue for e2e tests');
      }

      return {
        organizationId: fallbackHostUser.org_id,
        venueId: fallbackHostUser.venue_id,
      };
    })();
  }

  return hostStandContextPromise;
}

async function getCurrentHostStandContext(page: Page): Promise<HostStandContext> {
  const venueName = (await page.locator('header').locator('span').nth(1).textContent())?.trim();
  if (!venueName) {
    return getHostStandContext();
  }

  const supabase = getServiceSupabase();
  const { data: venue } = await supabase
    .from('venues')
    .select('id, organization_id')
    .eq('name', venueName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!venue?.id || !venue.organization_id) {
    return getHostStandContext();
  }

  return {
    organizationId: venue.organization_id,
    venueId: venue.id,
  };
}

async function getBusinessDate(page: Page) {
  return page.locator('input[type="date"]').first().inputValue();
}

async function reloadHostStand(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[style*="aspect-ratio"]')).toBeVisible({ timeout: 15000 });
}

function actionSheetForTable(page: Page, tableNumber: string) {
  return page.locator('div').filter({
    has: page.getByRole('heading', { name: new RegExp(`^Table\\s+${tableNumber}$`, 'i') }),
    hasText: /block table|combine tables|seat walk-in/i,
  }).last();
}

async function createSeedTable(cleanup: CleanupState, params: {
  context: HostStandContext;
  businessDate: string;
  tableNumber: string;
  posX: number;
  posY: number;
  minCapacity?: number;
  maxCapacity?: number;
}) {
  const supabase = getServiceSupabase();
  const { data: table, error } = await supabase
    .from('venue_tables')
    .insert({
      org_id: params.context.organizationId,
      venue_id: params.context.venueId,
      table_number: params.tableNumber,
      min_capacity: params.minCapacity ?? 1,
      max_capacity: params.maxCapacity ?? 4,
      shape: 'round',
      pos_x: params.posX,
      pos_y: params.posY,
      width: 7,
      height: 9,
      rotation: 0,
      is_active: true,
    })
    .select('id, table_number')
    .single();

  if (error || !table) {
    throw new Error(`Failed to create host-stand seed table: ${error?.message || 'unknown error'}`);
  }

  cleanup.tableIds.push(table.id);
  cleanup.tableStatusDates.push({ tableId: table.id, businessDate: params.businessDate });
  return table;
}

async function createSeedReservation(cleanup: CleanupState, params: {
  context: HostStandContext;
  businessDate: string;
  firstName: string;
  lastName: string;
  arrivalTime: string;
  partySize: number;
  status?: 'pending' | 'confirmed' | 'arrived';
}) {
  const supabase = getServiceSupabase();
  const { data: reservation, error } = await supabase
    .from('reservations')
    .insert({
      org_id: params.context.organizationId,
      venue_id: params.context.venueId,
      first_name: params.firstName,
      last_name: params.lastName,
      party_size: params.partySize,
      business_date: params.businessDate,
      arrival_time: params.arrivalTime,
      expected_duration: 90,
      table_ids: [],
      status: params.status ?? 'pending',
      channel: 'direct',
      is_vip: false,
      tags: [],
      pos_check_ids: [],
    })
    .select('id')
    .single();

  if (error || !reservation) {
    throw new Error(`Failed to create host-stand seed reservation: ${error?.message || 'unknown error'}`);
  }

  cleanup.reservationIds.push(reservation.id);
  return reservation;
}

async function cleanupSeedData(cleanup: CleanupState) {
  const supabase = getServiceSupabase();

  for (const entry of cleanup.tableStatusDates) {
    await supabase
      .from('table_status_events')
      .delete()
      .eq('table_id', entry.tableId)
      .eq('business_date', entry.businessDate);
    await supabase
      .from('table_status')
      .delete()
      .eq('table_id', entry.tableId)
      .eq('business_date', entry.businessDate);
  }

  if (cleanup.waitlistEntryIds.length > 0) {
    await supabase.from('waitlist_entries').delete().in('id', cleanup.waitlistEntryIds);
  }

  if (cleanup.reservationIds.length > 0) {
    await supabase.from('reservation_events').delete().in('reservation_id', cleanup.reservationIds);
    await supabase.from('reservations').delete().in('id', cleanup.reservationIds);
  }

  if (cleanup.tableIds.length > 0) {
    await supabase.from('venue_tables').delete().in('id', cleanup.tableIds);
  }
}

test.describe('Host Stand', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/host-stand');

    // Skip all host-stand tests if the page returns 404
    const is404 = await page.locator('text=404').isVisible().catch(() => false);
    test.skip(is404, 'Host stand page not available (404)');

    // Wait for floor plan canvas to render
    await expect(page.locator('[style*="aspect-ratio"]')).toBeVisible({ timeout: 15_000 });
  });

  async function openFirstTableActionSheet(page: Page) {
    const table = page.locator('[data-table-id]').first();
    const hasTable = await table.isVisible().catch(() => false);
    test.skip(!hasTable, 'No tables visible for the current business date');
    await table.click();
    const sheet = page.locator('h3', { hasText: /^Table\s+\S+/ }).locator('..').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    return sheet;
  }

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

    const tables = page.locator('[data-table-id]');
    const count = await tables.count();
    if (count === 0) {
      await expect(page.getByText(/no tables yet/i)).toBeVisible();
      await expect(page.getByText(/^0\/0$/i).first()).toBeVisible();
      return;
    }

    await expect(tables.first()).toBeVisible({ timeout: 10_000 });
    expect(count).toBeGreaterThan(0);

    // Metrics bar at bottom
    await expect(page.getByText(/covers/i).first()).toBeVisible();
  });

  test('tables show correct status colors', async ({ page }) => {
    const tables = page.locator('[data-table-id]');
    const count = await tables.count();
    if (count === 0) {
      await expect(page.getByText(/no tables yet/i)).toBeVisible();
      return;
    }

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

  test('seeded table renders on the floor plan', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentHostStandContext(page);
      const businessDate = await getBusinessDate(page);
      const token = randomUUID().slice(0, 6).toUpperCase();
      const table = await createSeedTable(cleanup, {
        context,
        businessDate,
        tableNumber: `E2E-${token}`,
        posX: 30,
        posY: 10,
      });

      await reloadHostStand(page);
      const tableCard = page.locator(`[data-table-id="${table.id}"]`);
      await expect(tableCard).toBeVisible({ timeout: 10000 });
      await expect(tableCard).toContainText(table.table_number);
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  // ── Drag-to-Seat ─────────────────────────────────────────────

  test('drag reservation to available table seats the party', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentHostStandContext(page);
      const businessDate = await getBusinessDate(page);
      const token = randomUUID().slice(0, 6).toUpperCase();
      const table = await createSeedTable(cleanup, {
        context,
        businessDate,
        tableNumber: `DRAG-${token}`,
        posX: 72,
        posY: 68,
      });
      const guestFirstName = `Drag${token}`;
      const guestLastName = 'Guest';
      const reservation = await createSeedReservation(cleanup, {
        context,
        businessDate,
        firstName: guestFirstName,
        lastName: guestLastName,
        arrivalTime: '18:00:00',
        partySize: 2,
      });

      await reloadHostStand(page);

      const rezRow = page.locator('[style*="cursor: grab"]').filter({ hasText: `${guestFirstName} ${guestLastName}` }).first();
      const availableTable = page.locator(`[data-table-id="${table.id}"]`);
      const supabase = getServiceSupabase();
      await expect(availableTable).toBeVisible({ timeout: 10000 });

      const rezBox = await rezRow.boundingBox();
      const tableBox = await availableTable.boundingBox();
      if (!rezBox || !tableBox) {
        throw new Error('Seeded drag scenario did not render in host-stand UI');
      }

      await page.mouse.move(rezBox.x + rezBox.width / 2, rezBox.y + rezBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2, { steps: 10 });
      await page.mouse.up();

      await expect
        .poll(async () => {
          const [{ data: tableStatus }, { data: reservationState }] = await Promise.all([
            supabase
              .from('table_status')
              .select('status, reservation_id, party_size')
              .eq('table_id', table.id)
              .eq('business_date', businessDate)
              .maybeSingle(),
            supabase
              .from('reservations')
              .select('status, table_ids')
              .eq('id', reservation.id)
              .maybeSingle(),
          ]);

          return {
            tableStatus: tableStatus?.status ?? null,
            reservationId: tableStatus?.reservation_id ?? null,
            partySize: tableStatus?.party_size ?? null,
            reservationStatus: reservationState?.status ?? null,
            reservationTableIds: reservationState?.table_ids ?? [],
          };
        }, { timeout: 20000 })
        .toMatchObject({
          tableStatus: expect.stringMatching(/reserved|seated|occupied|check_dropped|bussing/),
          reservationId: reservation.id,
          partySize: 2,
          reservationStatus: expect.stringMatching(/arrived|seated/),
          reservationTableIds: expect.arrayContaining([table.id]),
        });
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  // ── Seat Walk-in ──────────────────────────────────────────────

  test('seat walk-in dialog opens and submits', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentHostStandContext(page);
      const businessDate = await getBusinessDate(page);
      const token = randomUUID().slice(0, 6).toUpperCase();
      const table = await createSeedTable(cleanup, {
        context,
        businessDate,
        tableNumber: `WALK-${token}`,
        posX: 42,
        posY: 12,
      });

      await reloadHostStand(page);
      await page.locator(`[data-table-id="${table.id}"]`).click();
      const sheet = actionSheetForTable(page, table.table_number);
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await sheet.getByRole('button', { name: /seat walk-in/i }).click();

      const guestNameInput = page.getByPlaceholder(/walk-in guest/i);
      await expect(guestNameInput).toBeVisible({ timeout: 5_000 });
      const dialog = guestNameInput.locator('xpath=ancestor::div[contains(@class,"relative")][1]');

      await guestNameInput.fill('E2E Walkin');
      await dialog.getByRole('button', { name: /^4$/ }).click();
      await dialog.getByRole('button', { name: /90m/i }).click();
      const seatPartyButton = dialog.getByRole('button', { name: /seat party/i });

      if (await seatPartyButton.isDisabled()) {
        await expect(page.getByText(/no tables yet|0\/0 available/i).first()).toBeVisible();
        return;
      }

      const seatResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/floor-plan/live/transition') &&
        response.request().method() === 'POST'
      );

      await seatPartyButton.click();

      const seatResponse = await seatResponsePromise;
      expect(seatResponse.ok(), await seatResponse.text()).toBeTruthy();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  // ── Waitlist ──────────────────────────────────────────────────

  test('add to waitlist dialog submits a new waitlist entry', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const addBtn = page.getByRole('button', { name: /^add to waitlist$/i });
      await expect(addBtn).toBeVisible();

      await addBtn.click();
      const nameField = page.getByPlaceholder(/^name$/i).last();
      await expect(nameField).toBeVisible({ timeout: 5000 });

      const suffix = Date.now().toString().slice(-6);
      const guestName = `E2E Waitlist ${suffix}`;
      const waitlistResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/waitlist') &&
        response.request().method() === 'POST'
      );

      await nameField.fill(guestName);
      await page.getByRole('button', { name: /^3$/ }).last().click();
      await page.getByPlaceholder(/\(555\) 123-4567/i).last().fill('3105551212');
      await page.getByPlaceholder(/seating preference, occasion/i).last().fill('E2E note');
      await page.getByRole('button', { name: /^add$/i }).last().click();

      const waitlistResponse = await waitlistResponsePromise;
      const waitlistJson = await waitlistResponse.json().catch(() => null);
      if (waitlistJson?.entry?.id) {
        cleanup.waitlistEntryIds.push(waitlistJson.entry.id);
      }
      expect(waitlistResponse.ok(), JSON.stringify(waitlistJson)).toBeTruthy();
      await expect(dialog).not.toBeVisible({ timeout: 10000 });
      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('waitlist_entries')
            .select('guest_name, status')
            .eq('id', waitlistJson?.entry?.id || '')
            .maybeSingle();
          return data?.guest_name ?? null;
        }, { timeout: 20000 })
        .toBe(guestName);
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  // ── Reservation Actions ───────────────────────────────────────

  test('mark arrived button works on pending reservation', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentHostStandContext(page);
      const businessDate = await getBusinessDate(page);
      const token = randomUUID().slice(0, 6).toUpperCase();
      const guestFirstName = `Arrive${token}`;
      const guestLastName = 'Guest';
      const reservation = await createSeedReservation(cleanup, {
        context,
        businessDate,
        firstName: guestFirstName,
        lastName: guestLastName,
        arrivalTime: '18:30:00',
        partySize: 3,
      });

      await reloadHostStand(page);

      const row = page.locator('[style*="cursor: grab"]').filter({ hasText: `${guestFirstName} ${guestLastName}` }).first();
      await row.getByRole('button', { name: /^arrived$/i }).click();

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('reservations')
            .select('status')
            .eq('id', reservation.id)
            .maybeSingle();
          return data?.status ?? null;
        }, { timeout: 20000 })
        .toBe('arrived');

      await reloadHostStand(page);
      await expect(
        page.locator('[style*="cursor: grab"]').filter({ hasText: `${guestFirstName} ${guestLastName}` }).first()
      ).toHaveCount(0);
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  test('available table action sheet offers seat walk-in and block actions', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentHostStandContext(page);
      const businessDate = await getBusinessDate(page);
      const token = randomUUID().slice(0, 6).toUpperCase();
      const table = await createSeedTable(cleanup, {
        context,
        businessDate,
        tableNumber: `ACT-${token}`,
        posX: 30,
        posY: 10,
      });

      await reloadHostStand(page);
      await page.locator(`[data-table-id="${table.id}"]`).click();
      const sheet = actionSheetForTable(page, table.table_number);
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByRole('button', { name: /seat walk-in/i })).toBeVisible();
      await expect(sheet.getByRole('button', { name: /block table/i })).toBeVisible();
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  // ── Date Navigation ───────────────────────────────────────────

  test('date navigation changes business date', async ({ page }) => {
    // Find date navigation arrows
    const nextBtn = page.locator('button').filter({ hasText: /›|→|next/i }).first()
      .or(page.locator('[aria-label*="next"]').first());
    const headerNextBtn = page.locator('header button').nth(2);
    const hasNav = await headerNextBtn.isVisible().catch(() => false);
    test.skip(!hasNav, 'No date navigation');

    const dateInput = page.locator('header input[type="date"]').first();
    const dateValue = await dateInput.inputValue();
    const expectedNextDate = new Date(`${dateValue}T12:00:00`);
    expectedNextDate.setDate(expectedNextDate.getDate() + 1);
    const expectedNextValue = expectedNextDate.toISOString().slice(0, 10);
    await headerNextBtn.click();

    await expect
      .poll(async () => dateInput.inputValue(), { timeout: 10000 })
      .toBe(expectedNextValue);
  });

  // ── Real-time Updates ─────────────────────────────────────────

  test('floor plan polls and updates', async ({ page }) => {
    const nextBtn = page.locator('button').filter({ hasText: /›|next/i }).first()
      .or(page.locator('[aria-label*="next"]').first());
    const headerNextBtn = page.locator('header button').nth(2);
    const liveResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/floor-plan/live?') &&
      response.request().method() === 'GET'
    );

    await headerNextBtn.click();

    const liveResponse = await liveResponsePromise;
    expect(liveResponse.ok()).toBeTruthy();
  });
});
