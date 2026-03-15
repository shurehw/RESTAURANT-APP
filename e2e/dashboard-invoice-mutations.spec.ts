import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

type ServiceSupabase = ReturnType<typeof createClient>;

type SeedContext = {
  organizationId: string;
  venueId: string;
};

type CleanupState = {
  invoiceIds: string[];
  purchaseOrderIds: string[];
  itemIds: string[];
  vendorIds: string[];
};

let seedContextPromise: Promise<SeedContext> | null = null;

function getServiceSupabase(): ServiceSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase service role credentials for invoice e2e tests');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

async function getSeedContext(): Promise<SeedContext> {
  if (!seedContextPromise) {
    seedContextPromise = (async () => {
      const supabase = getServiceSupabase();
      const dashboardEmail = process.env.E2E_DASHBOARD_EMAIL;

      if (dashboardEmail) {
        const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = users.data.users.find((user) => user.email?.toLowerCase() === dashboardEmail.toLowerCase());

        if (authUser) {
          const { data: membership } = await supabase
            .from('organization_users')
            .select('organization_id, venue_ids')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (membership?.organization_id) {
            let venueQuery = supabase
              .from('venues')
              .select('id, organization_id')
              .eq('organization_id', membership.organization_id)
              .eq('is_active', true);

            if (Array.isArray(membership.venue_ids) && membership.venue_ids.length > 0) {
              venueQuery = venueQuery.in('id', membership.venue_ids);
            }

            const { data: venue } = await venueQuery.limit(1).maybeSingle();

            if (venue?.id && venue.organization_id) {
              return {
                organizationId: venue.organization_id,
                venueId: venue.id,
              };
            }
          }
        }
      }

      const { data: fallbackVenue, error } = await supabase
        .from('venues')
        .select('id, organization_id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error || !fallbackVenue?.id || !fallbackVenue.organization_id) {
        throw new Error('Could not resolve an active venue for invoice e2e tests');
      }

      return {
        organizationId: fallbackVenue.organization_id,
        venueId: fallbackVenue.id,
      };
    })();
  }

  return seedContextPromise;
}

async function getCurrentPageVenueContext(page: Page): Promise<SeedContext> {
  await gotoStable(page, '/invoices');
  await ensureAuthenticated(page);
  await page.waitForLoadState('domcontentloaded').catch(() => null);

  let selectedVenueId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page
      .waitForFunction(() => window.localStorage.getItem('selectedVenueId'), undefined, { timeout: 5000 })
      .catch(() => null);

    try {
      selectedVenueId = await page.evaluate(() => window.localStorage.getItem('selectedVenueId'));
      break;
    } catch (error) {
      const message = String((error as Error)?.message || '');
      if (!message.includes('Execution context was destroyed') || attempt === 2) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => null);
    }
  }

  if (!selectedVenueId || selectedVenueId === 'all') {
    return getSeedContext();
  }

  const supabase = getServiceSupabase();
  const { data: venue, error } = await supabase
    .from('venues')
    .select('id, organization_id')
    .eq('id', selectedVenueId)
    .maybeSingle();

  if (error || !venue?.id || !venue.organization_id) {
    return getSeedContext();
  }

  return {
    venueId: venue.id,
    organizationId: venue.organization_id,
  };
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function newCleanupState(): CleanupState {
  return {
    invoiceIds: [],
    purchaseOrderIds: [],
    itemIds: [],
    vendorIds: [],
  };
}

async function cleanupSeedData(state: CleanupState) {
  const supabase = getServiceSupabase();

  if (state.invoiceIds.length > 0) {
    await supabase.from('ap_approvals').delete().in('invoice_id', state.invoiceIds);
    await supabase.from('invoice_variances').delete().in('invoice_id', state.invoiceIds);

    const { data: receipts } = await supabase
      .from('receipts')
      .select('id')
      .in('invoice_id', state.invoiceIds);

    const receiptIds = (receipts || []).map((receipt) => receipt.id);
    if (receiptIds.length > 0) {
      await supabase.from('receipt_lines').delete().in('receipt_id', receiptIds);
      await supabase.from('receipts').delete().in('id', receiptIds);
    }

    await supabase.from('invoice_lines').delete().in('invoice_id', state.invoiceIds);
    await supabase.from('unmapped_items').delete().in('last_seen_invoice_id', state.invoiceIds);
    await supabase.from('invoices').delete().in('id', state.invoiceIds);
  }

  if (state.purchaseOrderIds.length > 0) {
    await supabase.from('purchase_order_items').delete().in('purchase_order_id', state.purchaseOrderIds);
    await supabase.from('purchase_orders').delete().in('id', state.purchaseOrderIds);
  }

  if (state.itemIds.length > 0) {
    await supabase.from('item_pack_configurations').delete().in('item_id', state.itemIds);
    await supabase.from('vendor_item_aliases').delete().in('item_id', state.itemIds);
    await supabase.from('items').delete().in('id', state.itemIds);
  }

  if (state.vendorIds.length > 0) {
    await supabase.from('vendor_item_aliases').delete().in('vendor_id', state.vendorIds);
    await supabase.from('vendors').delete().in('id', state.vendorIds);
  }
}

async function createVendorAndItem(cleanup: CleanupState, label: string, contextOverride?: SeedContext) {
  const supabase = getServiceSupabase();
  const context = contextOverride || await getSeedContext();
  const token = randomUUID().slice(0, 8);

  const vendorName = `E2E Vendor ${label} ${token}`;
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .insert({
      name: vendorName,
      normalized_name: normalizeName(vendorName),
      organization_id: context.organizationId,
      is_active: true,
    })
    .select('id, name')
    .single();

  if (vendorError || !vendor) {
    throw new Error(`Failed to create temp vendor: ${vendorError?.message || 'unknown error'}`);
  }
  cleanup.vendorIds.push(vendor.id);

  const itemName = `E2E Item ${label} ${token}`;
  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      organization_id: context.organizationId,
      name: itemName,
      sku: `E2E-${token.toUpperCase()}`,
      category: 'food',
      base_uom: 'unit',
      is_active: true,
    })
    .select('id, name, sku')
    .single();

  if (itemError || !item) {
    throw new Error(`Failed to create temp item: ${itemError?.message || 'unknown error'}`);
  }
  cleanup.itemIds.push(item.id);

  return { context, vendor, item, token };
}

async function createInvoice(params: {
  supabase?: ServiceSupabase;
  cleanup: CleanupState;
  context: SeedContext;
  vendorId: string;
  invoiceNumber: string;
  status: 'draft' | 'pending_approval';
  totalAmount: number;
  poNumberOcr?: string | null;
  lines: Array<{
    description: string;
    qty: number;
    unitCost: number;
    itemId?: string | null;
    vendorItemCode?: string | null;
  }>;
}) {
  const supabase = params.supabase || getServiceSupabase();
  const invoiceDate = new Date().toISOString().slice(0, 10);

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      organization_id: params.context.organizationId,
      venue_id: params.context.venueId,
      vendor_id: params.vendorId,
      invoice_number: params.invoiceNumber,
      invoice_date: invoiceDate,
      total_amount: params.totalAmount,
      status: params.status,
      po_number_ocr: params.poNumberOcr ?? null,
    })
    .select('id, invoice_number')
    .single();

  if (invoiceError || !invoice) {
    throw new Error(`Failed to create temp invoice: ${invoiceError?.message || 'unknown error'}`);
  }
  params.cleanup.invoiceIds.push(invoice.id);

  const linesToInsert = params.lines.map((line) => ({
    invoice_id: invoice.id,
    description: line.description,
    qty: line.qty,
    unit_cost: line.unitCost,
    item_id: line.itemId ?? null,
    vendor_item_code: line.vendorItemCode ?? null,
    is_ignored: false,
  }));

  const { data: invoiceLines, error: lineError } = await supabase
    .from('invoice_lines')
    .insert(linesToInsert)
    .select('id, description');

  if (lineError || !invoiceLines) {
    throw new Error(`Failed to create temp invoice lines: ${lineError?.message || 'unknown error'}`);
  }

  return { invoice, invoiceLines };
}

async function createPurchaseOrder(params: {
  supabase?: ServiceSupabase;
  cleanup: CleanupState;
  context: SeedContext;
  vendorId: string;
  itemId: string;
  orderNumber: string;
  quantity: number;
  unitPrice: number;
}) {
  const supabase = params.supabase || getServiceSupabase();
  const orderDate = new Date().toISOString().slice(0, 10);

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      vendor_id: params.vendorId,
      venue_id: params.context.venueId,
      order_number: params.orderNumber,
      order_date: orderDate,
      status: 'ordered',
      total_amount: Number((params.quantity * params.unitPrice).toFixed(2)),
    })
    .select('id, order_number')
    .single();

  if (poError || !po) {
    throw new Error(`Failed to create temp purchase order: ${poError?.message || 'unknown error'}`);
  }
  params.cleanup.purchaseOrderIds.push(po.id);

  const { error: itemError } = await supabase.from('purchase_order_items').insert({
    purchase_order_id: po.id,
    item_id: params.itemId,
    quantity: params.quantity,
    qty_received: 0,
    unit_price: params.unitPrice,
  });

  if (itemError) {
    throw new Error(`Failed to create temp purchase order item: ${itemError.message}`);
  }

  return po;
}

async function searchInvoicesList(page: Page, invoiceNumber: string, context: SeedContext) {
  await page.evaluate((venueId: string) => {
    window.localStorage.setItem('selectedVenueId', venueId);
  }, context.venueId).catch(() => null);
  await page.addInitScript((venueId: string) => {
    window.localStorage.setItem('selectedVenueId', venueId);
  }, context.venueId);
  await gotoStable(page, '/invoices');
  await ensureAuthenticated(page);
  await expect(page.locator('[data-invoices-interactive="true"]')).toBeVisible({ timeout: 30000 });
  const search = page.getByPlaceholder(/search invoices, vendors, po numbers/i).first();
  await search.fill(invoiceNumber);
  await expect(page.locator('tr', { hasText: invoiceNumber }).first()).toBeVisible({ timeout: 20000 });
  return page.locator('tr', { hasText: invoiceNumber }).first();
}

test.describe('Dashboard Invoice Mutations', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(120000);
  });

  test('auto-match links a draft invoice to a seeded purchase order', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentPageVenueContext(page);
      const { vendor, item, token } = await createVendorAndItem(cleanup, 'automatch', context);
      const orderNumber = `E2E-PO-${token}`;
      const invoiceNumber = `E2E-INV-AUTO-${token}`;

      await createPurchaseOrder({
        cleanup,
        context,
        vendorId: vendor.id,
        itemId: item.id,
        orderNumber,
        quantity: 3,
        unitPrice: 12.5,
      });

      const { invoice } = await createInvoice({
        cleanup,
        context,
        vendorId: vendor.id,
        invoiceNumber,
        status: 'draft',
        totalAmount: 37.5,
        poNumberOcr: orderNumber,
        lines: [
          {
            description: item.name,
            qty: 3,
            unitCost: 12.5,
            itemId: item.id,
            vendorItemCode: `AUTO-${token}`,
          },
        ],
      });

      const row = await searchInvoicesList(page, invoiceNumber, context);
      const reviewHref = await row.getByRole('link', { name: /view/i }).getAttribute('href');
      expect(reviewHref).toContain(`/invoices/${invoice.id}/review`);

      const requestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/invoices/') &&
        request.url().includes('/auto-match') &&
        request.method() === 'POST'
      );
      const responsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/invoices/') &&
        response.url().includes('/auto-match') &&
        response.request().method() === 'POST'
      );
      const matchButton = row.getByRole('button', { name: /auto-match|match/i });
      await matchButton.click();
      await requestPromise;
      const response = await responsePromise;
      let result: Record<string, unknown> | null = null;
      let responseBodyError: string | null = null;

      try {
        result = await response.json();
      } catch (error) {
        responseBodyError = error instanceof Error ? error.message : String(error);
      }

      expect(response.ok(), responseBodyError ?? JSON.stringify(result)).toBeTruthy();
      if (result) {
        expect(result).toMatchObject({
          po_number: orderNumber,
          matched_lines: 1,
        });
      }

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('invoices')
            .select('purchase_order_id, match_confidence')
            .eq('id', invoice.id)
            .maybeSingle();
          return data;
        }, { timeout: 20000 })
        .toMatchObject({
          purchase_order_id: expect.any(String),
          match_confidence: expect.stringMatching(/high|medium|low/),
        });
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  test('reject changes a pending invoice back to draft with a reason', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentPageVenueContext(page);
      const { vendor, token } = await createVendorAndItem(cleanup, 'reject', context);
      const invoiceNumber = `E2E-INV-REJECT-${token}`;

      const { invoice } = await createInvoice({
        cleanup,
        context,
        vendorId: vendor.id,
        invoiceNumber,
        status: 'pending_approval',
        totalAmount: 22,
        lines: [
          {
            description: `Reject line ${token}`,
            qty: 2,
            unitCost: 11,
          },
        ],
      });

      const row = await searchInvoicesList(page, invoiceNumber, context);
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('prompt');
        await dialog.accept('E2E rejection');
      });
      await row.getByRole('button', { name: /^reject$/i }).click();

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('invoices')
            .select('status')
            .eq('id', invoice.id)
            .maybeSingle();
          return data;
        }, { timeout: 20000 })
        .toMatchObject({
          status: 'draft',
        });
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  test('bulk review surfaces a seeded unmapped line and maps it', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const { context, vendor, item, token } = await createVendorAndItem(cleanup, 'bulkmap');
      const lineDescription = item.name;

      await createInvoice({
        cleanup,
        context,
        vendorId: vendor.id,
        invoiceNumber: `E2E-INV-BULK-${token}`,
        status: 'draft',
        totalAmount: 14,
        lines: [
          {
            description: lineDescription,
            qty: 2,
            unitCost: 7,
            vendorItemCode: `BULK-${token}`,
          },
        ],
      });

      await gotoStable(page, `/invoices/bulk-review?search=${encodeURIComponent(token)}`);
      await ensureAuthenticated(page);
      await expect(page.getByText(lineDescription, { exact: true }).first()).toBeVisible({ timeout: 20000 });
      await page.getByText(item.sku, { exact: true }).click();
      await expect(page.getByRole('button', { name: /map to this item/i })).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /map to this item/i }).click();

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('invoice_lines')
            .select('item_id')
            .eq('vendor_item_code', `BULK-${token}`)
            .maybeSingle();
          return data?.item_id ?? null;
        }, { timeout: 40000 })
        .toBe(item.id);
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  test('review page approves a fully mapped invoice', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getCurrentPageVenueContext(page);
      const { vendor, item, token } = await createVendorAndItem(cleanup, 'approve', context);
      const invoiceNumber = `E2E-INV-APPROVE-${token}`;

      const { invoice } = await createInvoice({
        cleanup,
        context,
        vendorId: vendor.id,
        invoiceNumber,
        status: 'draft',
        totalAmount: 18,
        lines: [
          {
            description: item.name,
            qty: 2,
            unitCost: 9,
            itemId: item.id,
            vendorItemCode: `APP-${token}`,
          },
        ],
      });

      await gotoStable(page, `/invoices/${invoice.id}/review`);
      await ensureAuthenticated(page);
      await expect(page.getByRole('heading', { name: /review invoice/i })).toBeVisible();
      await expect(page.locator('[data-invoice-review-actions-ready="true"]')).toBeVisible({ timeout: 30000 });

      const approveRequestPromise = page.waitForRequest((request) =>
        request.url().includes(`/api/invoices/${invoice.id}/approve`) &&
        request.method() === 'POST'
      );
      const approveResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/invoices/${invoice.id}/approve`) &&
        response.request().method() === 'POST'
      );

      await page.getByRole('button', { name: /approve & save/i }).click();
      await approveRequestPromise;
      const approveResponse = await approveResponsePromise;
      const approveResult = await approveResponse.json().catch(() => null);
      expect(approveResponse.ok(), JSON.stringify(approveResult)).toBeTruthy();

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('invoices')
            .select('status')
            .eq('id', invoice.id)
            .maybeSingle();
          return data?.status ?? null;
        }, { timeout: 40000 })
        .toBe('approved');
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  test('review page can unmap a mapped line', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const { context, vendor, item, token } = await createVendorAndItem(cleanup, 'unmap');
      const { invoice } = await createInvoice({
        cleanup,
        context,
        vendorId: vendor.id,
        invoiceNumber: `E2E-INV-UNMAP-${token}`,
        status: 'draft',
        totalAmount: 16,
        lines: [
          {
            description: item.name,
            qty: 2,
            unitCost: 8,
            itemId: item.id,
          },
        ],
      });

      await gotoStable(page, `/invoices/${invoice.id}/review`);
      await ensureAuthenticated(page);
      await expect(page.locator('[data-mapped-items-ready="true"]')).toBeVisible({ timeout: 30000 });
      const unmapRequestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/invoice-lines/') &&
        request.url().includes('/unmap') &&
        request.method() === 'POST'
      );
      const unmapResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/invoice-lines/') &&
        response.url().includes('/unmap') &&
        response.request().method() === 'POST'
      );
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('table tbody tr', { hasText: item.name }).locator('button').last().click({ force: true });
      await unmapRequestPromise;
      const unmapResponse = await unmapResponsePromise;
      expect(unmapResponse.ok(), await unmapResponse.text()).toBeTruthy();

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('invoice_lines')
            .select('item_id')
            .eq('invoice_id', invoice.id)
            .maybeSingle();
          return data?.item_id ?? null;
        }, { timeout: 20000 })
        .toBeNull();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /mapped items \(0\)/i })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(item.name, { exact: true }).first()).toBeVisible({ timeout: 20000 });
    } finally {
      await cleanupSeedData(cleanup);
    }
  });

  test('review page can ignore an unmapped line', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const { context, vendor, token } = await createVendorAndItem(cleanup, 'ignore');
      const lineDescription = `Ignore only ${token}`;

      const { invoice, invoiceLines } = await createInvoice({
        cleanup,
        context,
        vendorId: vendor.id,
        invoiceNumber: `E2E-INV-IGNORE-${token}`,
        status: 'draft',
        totalAmount: 6,
        lines: [
          {
            description: lineDescription,
            qty: 1,
            unitCost: 6,
            vendorItemCode: `IGN-${token}`,
          },
        ],
      });

      await gotoStable(page, `/invoices/${invoice.id}/review`);
      await ensureAuthenticated(page);
      await expect(page.locator('[data-invoice-line-mapper-ready="true"]').first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(lineDescription, { exact: true }).first()).toBeVisible({ timeout: 20000 });
      const ignoreRequestPromise = page.waitForRequest((request) =>
        request.url().includes('/api/invoice-lines/') &&
        request.url().includes('/ignore') &&
        request.method() === 'POST'
      );
      const ignoreResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/invoice-lines/') &&
        response.url().includes('/ignore') &&
        response.request().method() === 'POST'
      );
      await page.getByRole('button', { name: /^ignore$/i }).click();
      await ignoreRequestPromise;
      const ignoreResponse = await ignoreResponsePromise;
      expect(ignoreResponse.ok()).toBeTruthy();

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('invoice_lines')
            .select('is_ignored')
            .eq('id', invoiceLines[0].id)
            .maybeSingle();
          return data?.is_ignored ?? false;
        }, { timeout: 20000 })
        .toBeTruthy();

      await gotoStable(page, `/invoices/${invoice.id}/review`);
      await expect(page.getByText(lineDescription, { exact: true }).first()).not.toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: /^ignore$/i })).toHaveCount(0);
    } finally {
      await cleanupSeedData(cleanup);
    }
  });
});
