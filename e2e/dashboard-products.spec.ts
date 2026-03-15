import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

type ServiceSupabase = ReturnType<typeof createClient>;

type SeedContext = {
  organizationId: string;
  venueId: string;
};

type CleanupState = {
  itemIds: string[];
  customProductIds: string[];
  scrapedPriceIds: string[];
  manualPriceIds: string[];
};

let seedContextPromise: Promise<SeedContext> | null = null;

function getServiceSupabase(): ServiceSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase service role credentials for products e2e tests');
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
        throw new Error('Could not resolve an active venue for products e2e tests');
      }

      return {
        organizationId: fallbackVenue.organization_id,
        venueId: fallbackVenue.id,
      };
    })();
  }

  return seedContextPromise;
}

function getMissingColumn(errorMessage: string): string | null {
  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]?([^'".\s]+)['"]? does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function insertAdaptive(
  supabase: ServiceSupabase,
  table: string,
  payload: Record<string, unknown>,
) {
  const candidate = { ...payload };

  while (true) {
    const { data, error } = await supabase.from(table).insert(candidate).select('*').single();
    if (!error && data) {
      return data;
    }

    const message = error?.message || 'unknown error';
    const missingColumn = getMissingColumn(message);
    if (missingColumn && missingColumn in candidate) {
      delete candidate[missingColumn];
      continue;
    }

    throw new Error(`Failed to insert into ${table}: ${message}`);
  }
}

function newCleanupState(): CleanupState {
  return {
    itemIds: [],
    customProductIds: [],
    scrapedPriceIds: [],
    manualPriceIds: [],
  };
}

async function cleanupSeedData(state: CleanupState) {
  const supabase = getServiceSupabase();

  if (state.manualPriceIds.length > 0) {
    await supabase.from('custom_product_competitor_pricing').delete().in('id', state.manualPriceIds);
  }

  if (state.scrapedPriceIds.length > 0) {
    await supabase.from('competitor_products_scraped').delete().in('id', state.scrapedPriceIds);
  }

  if (state.customProductIds.length > 0) {
    await supabase.from('custom_catalog_products').delete().in('id', state.customProductIds);
  }

  if (state.itemIds.length > 0) {
    await supabase.from('item_pack_configurations').delete().in('item_id', state.itemIds);
    await supabase.from('items').delete().in('id', state.itemIds);
  }
}

async function createSeedItem(cleanup: CleanupState, context: SeedContext) {
  const supabase = getServiceSupabase();
  const token = randomUUID().slice(0, 8).toUpperCase();
  const itemName = `E2E Product ${token}`;
  const sku = `E2E-PROD-${token}`;

  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      organization_id: context.organizationId,
      name: itemName,
      sku,
      category: 'food',
      subcategory: 'Test Coverage',
      base_uom: 'unit',
      is_active: true,
    })
    .select('id, name, sku')
    .single();

  if (itemError || !item) {
    throw new Error(`Failed to create seeded product item: ${itemError?.message || 'unknown error'}`);
  }
  cleanup.itemIds.push(item.id);

  const { error: packError } = await supabase.from('item_pack_configurations').insert({
    item_id: item.id,
    pack_type: 'case',
    units_per_pack: 6,
    unit_size: 1,
    unit_size_uom: 'unit',
    conversion_factor: 6,
  });

  if (packError) {
    throw new Error(`Failed to create seeded item pack config: ${packError.message}`);
  }

  return { item, token };
}

async function createCompetitorPricingSeed(cleanup: CleanupState, context: SeedContext) {
  const supabase = getServiceSupabase();
  const token = randomUUID().slice(0, 8).toUpperCase();
  const catalogName = `E2E Catalog Product ${token}`;
  const scrapedName = `E2E Scraped Product ${token}`;
  const competitorName = `E2E Competitor ${token}`;

  const customProduct = await insertAdaptive(supabase, 'custom_catalog_products', {
    organization_id: context.organizationId,
    org_id: context.organizationId,
    name: catalogName,
    product_name: catalogName,
    title: catalogName,
    sku: `E2E-CAT-${token}`,
    is_active: true,
  });

  if (!customProduct?.id) {
    throw new Error('Custom catalog product seed did not return an id');
  }
  cleanup.customProductIds.push(customProduct.id);

  const scraped = await insertAdaptive(supabase, 'competitor_products_scraped', {
    organization_id: context.organizationId,
    org_id: context.organizationId,
    competitor_name: competitorName,
    competitor: competitorName,
    product_name: scrapedName,
    name: scrapedName,
    title: scrapedName,
    variant: '12 pack',
    category: 'food',
    min_qty: 1,
    minimum_qty: 1,
    unit_price: 19.95,
    price: 19.95,
    price_per_unit: 19.95,
    source_url: `https://example.com/e2e-${token.toLowerCase()}`,
    url: `https://example.com/e2e-${token.toLowerCase()}`,
    scraped_at: new Date().toISOString(),
    scrape_date: new Date().toISOString(),
  });

  if (!scraped?.id) {
    throw new Error('Scraped competitor seed did not return an id');
  }
  cleanup.scrapedPriceIds.push(scraped.id);

  return {
    token,
    customProductId: customProduct.id as string,
    customProductLabel: String(customProduct.name ?? customProduct.product_name ?? customProduct.title),
    scrapedId: scraped.id as string,
    competitorName: String(scraped.competitor_name ?? scraped.competitor ?? ''),
    scrapedProductName: String(scraped.product_name ?? scraped.name ?? scraped.title ?? ''),
  };
}

test.describe('Dashboard Products', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(120000);
  });

  test('products page can search, edit, and persist a seeded product', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getSeedContext();
      const { item, token } = await createSeedItem(cleanup, context);
      const updatedName = `${item.name} Updated`;

      await gotoStable(page, '/products');
      await ensureAuthenticated(page);
      await expect(page.getByRole('heading', { name: /^products$/i })).toBeVisible({ timeout: 30000 });

      const search = page.getByPlaceholder(/search products by name, sku, or category/i);
      await search.fill(token);
      const row = page.locator('tr', { hasText: item.sku }).first();
      await expect(row).toBeVisible({ timeout: 20000 });

      await row.click();
      await expect(page.getByRole('heading', { name: /edit product/i })).toBeVisible({ timeout: 10000 });

      const patchRequestPromise = page.waitForRequest((request) =>
        request.url().includes(`/api/items/${item.id}`) && request.method() === 'PATCH'
      );
      const patchResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/items/${item.id}`) && response.request().method() === 'PATCH'
      );

      const nameInput = page.getByLabel(/product name/i);
      await nameInput.fill(updatedName);
      await page.getByRole('button', { name: /save changes/i }).click();

      await patchRequestPromise;
      const patchResponse = await patchResponsePromise;
      const patchJson = await patchResponse.json().catch(() => null);
      expect(patchResponse.ok(), JSON.stringify(patchJson)).toBeTruthy();
      await page.waitForLoadState('domcontentloaded').catch(() => null);

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('items')
            .select('name')
            .eq('id', item.id)
            .maybeSingle();
          return data?.name ?? null;
        }, { timeout: 20000 })
        .toBe(updatedName);

      await search.fill('Updated');
      await expect(page.locator('tr', { hasText: updatedName }).first()).toBeVisible({ timeout: 20000 });
    } finally {
      void cleanupSeedData(cleanup);
    }
  });

  test('competitor pricing page can import a scraped row for a seeded custom product', async ({ page }) => {
    const cleanup = newCleanupState();

    try {
      const context = await getSeedContext();
      const seed = await createCompetitorPricingSeed(cleanup, context);

      await gotoStable(page, '/products/competitor-pricing');
      await ensureAuthenticated(page);
      await expect(page.getByRole('heading', { name: /custom catalog competitor pricing/i })).toBeVisible({ timeout: 30000 });
      await expect(page.locator('[data-competitor-pricing-ready="true"]')).toBeVisible({ timeout: 30000 });

      const scrapedTab = page.getByRole('button', { name: /scraped prices/i });
      await expect(scrapedTab).toBeVisible({ timeout: 20000 });
      await scrapedTab.click();
      await expect(page.getByRole('columnheader', { name: /^action$/i })).toBeVisible({ timeout: 20000 });

      const search = page.getByPlaceholder(/search competitor, product, variant/i);
      await search.fill(seed.token);

      const select = page.locator('select').nth(1);
      await select.selectOption(seed.customProductId);

      const scrapedRow = page.locator('tr', { hasText: seed.scrapedProductName }).first();
      await expect(scrapedRow).toBeVisible({ timeout: 20000 });

      const importResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/products/custom-catalog/competitor-pricing') &&
        response.request().method() === 'POST'
      );

      await scrapedRow.getByRole('button', { name: /^import$/i }).click();
      const importResponse = await importResponsePromise;
      const importJson = await importResponse.json().catch(() => null);
      expect(importResponse.ok(), JSON.stringify(importJson)).toBeTruthy();
      const manualRecordId = importJson?.record?.id as string | undefined;
      expect(manualRecordId).toBeTruthy();
      if (manualRecordId) {
        cleanup.manualPriceIds.push(manualRecordId);
      }

      await expect(page.getByText(/imported scraped price into manual linked pricing/i)).toBeVisible({ timeout: 20000 });
      await page.getByRole('button', { name: /manual & linked prices/i }).click();
      await search.fill(seed.token);
      await expect(page.locator('tr', { hasText: seed.customProductLabel }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.locator('tr', { hasText: seed.competitorName }).first()).toBeVisible({ timeout: 20000 });

      const supabase = getServiceSupabase();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('custom_product_competitor_pricing')
            .select('*')
            .eq('id', manualRecordId || '')
            .maybeSingle();
          return data?.id ?? null;
        }, { timeout: 20000 })
        .toEqual(expect.any(String));
    } finally {
      void cleanupSeedData(cleanup);
    }
  });
});
