/**
 * GET/POST /api/products/custom-catalog/competitor-pricing
 *
 * GET
 * - Returns manual competitor pricing records linked to custom catalog products.
 * - If include_scraped=true, also returns scraped competitor records.
 *
 * POST
 * - Imports one scraped competitor row into custom_product_competitor_pricing
 *   for a selected custom catalog product.
 *   Body: { custom_product_id, scraped_id }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveContext } from '@/lib/auth/resolveContext';

type AnyRecord = Record<string, any>;

async function getTableColumns(
  supabase: ReturnType<typeof createAdminClient>,
  tableName: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .schema('information_schema')
    .from('columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName);

  if (error || !data) return new Set();
  return new Set(data.map((r: { column_name: string }) => r.column_name));
}

function applyOrgScope(
  query: any,
  columns: Set<string>,
  orgId: string,
) {
  if (columns.has('organization_id')) return query.eq('organization_id', orgId);
  if (columns.has('org_id')) return query.eq('org_id', orgId);
  return query;
}

function normalizePrice(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeQty(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeManualRow(row: AnyRecord): AnyRecord {
  return {
    id: row.id,
    custom_product_id: row.custom_product_id ?? row.custom_catalog_product_id ?? row.product_id ?? null,
    competitor_name: row.competitor_name ?? row.competitor ?? row.vendor_name ?? null,
    product_name: row.product_name ?? row.competitor_product_name ?? row.name ?? null,
    variant: row.variant ?? row.size ?? row.pack ?? null,
    category: row.category ?? null,
    min_qty: normalizeQty(row.min_qty ?? row.minimum_qty ?? row.qty_break),
    unit_price: normalizePrice(row.unit_price ?? row.price ?? row.price_per_unit),
    source_url: row.source_url ?? row.url ?? null,
    scraped_at: row.scraped_at ?? row.scrape_date ?? row.created_at ?? null,
    created_at: row.created_at ?? null,
    raw: row,
  };
}

function normalizeScrapedRow(row: AnyRecord): AnyRecord {
  return {
    id: row.id,
    competitor_name: row.competitor_name ?? row.competitor ?? row.vendor_name ?? null,
    product_name: row.product_name ?? row.name ?? row.title ?? null,
    variant: row.variant ?? row.size ?? row.pack ?? null,
    category: row.category ?? null,
    min_qty: normalizeQty(row.min_qty ?? row.minimum_qty ?? row.qty_break),
    unit_price: normalizePrice(row.unit_price ?? row.price ?? row.price_per_unit),
    source_url: row.source_url ?? row.url ?? null,
    scraped_at: row.scraped_at ?? row.scrape_date ?? row.created_at ?? null,
    raw: row,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const includeScraped = request.nextUrl.searchParams.get('include_scraped') === 'true';

    const supabase = createAdminClient();
    const [manualCols, scrapedCols, productCols] = await Promise.all([
      getTableColumns(supabase, 'custom_product_competitor_pricing'),
      getTableColumns(supabase, 'competitor_products_scraped'),
      getTableColumns(supabase, 'custom_catalog_products'),
    ]);

    let manual: AnyRecord[] = [];
    let scraped: AnyRecord[] = [];
    let customProducts: AnyRecord[] = [];

    const manualQuery = applyOrgScope(
      supabase.from('custom_product_competitor_pricing').select('*').order('created_at', { ascending: false }),
      manualCols,
      ctx.orgId,
    );
    const manualRes = await manualQuery;
    if (!manualRes.error && manualRes.data) {
      manual = manualRes.data.map(normalizeManualRow);
    }

    const productQuery = applyOrgScope(
      supabase
        .from('custom_catalog_products')
        .select('*')
        .order('name', { ascending: true }),
      productCols,
      ctx.orgId,
    );
    const productRes = await productQuery;
    if (!productRes.error && productRes.data) {
      customProducts = productRes.data.map((p: AnyRecord) => ({
        id: p.id,
        name: p.name ?? p.product_name ?? p.title ?? `Product ${p.id}`,
        sku: p.sku ?? null,
      }));
    }

    if (includeScraped) {
      const scrapedQuery = applyOrgScope(
        supabase.from('competitor_products_scraped').select('*').order('created_at', { ascending: false }),
        scrapedCols,
        ctx.orgId,
      );
      const scrapedRes = await scrapedQuery;
      if (!scrapedRes.error && scrapedRes.data) {
        scraped = scrapedRes.data.map(normalizeScrapedRow);
      }
    }

    return NextResponse.json({
      success: true,
      manual_prices: manual,
      scraped_prices: scraped,
      custom_products: customProducts,
      counts: {
        manual: manual.length,
        scraped: scraped.length,
      },
    });
  } catch (error) {
    console.error('[competitor-pricing] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const customProductId = body?.custom_product_id as string | undefined;
    const scrapedId = body?.scraped_id as string | undefined;

    if (!customProductId || !scrapedId) {
      return NextResponse.json(
        { error: 'custom_product_id and scraped_id are required' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const [manualCols, scrapedCols, productCols] = await Promise.all([
      getTableColumns(supabase, 'custom_product_competitor_pricing'),
      getTableColumns(supabase, 'competitor_products_scraped'),
      getTableColumns(supabase, 'custom_catalog_products'),
    ]);

    // Validate selected custom product belongs to caller org (if table supports org scope).
    const productQuery = applyOrgScope(
      supabase
        .from('custom_catalog_products')
        .select('*')
        .eq('id', customProductId)
        .maybeSingle(),
      productCols,
      ctx.orgId,
    );
    const productRes = await productQuery;
    if (productRes.error || !productRes.data) {
      return NextResponse.json({ error: 'Selected custom product not found' }, { status: 404 });
    }

    const scrapedQuery = applyOrgScope(
      supabase
        .from('competitor_products_scraped')
        .select('*')
        .eq('id', scrapedId)
        .maybeSingle(),
      scrapedCols,
      ctx.orgId,
    );
    const scrapedRes = await scrapedQuery;
    if (scrapedRes.error || !scrapedRes.data) {
      return NextResponse.json({ error: 'Scraped record not found' }, { status: 404 });
    }

    const scraped = normalizeScrapedRow(scrapedRes.data);
    const now = new Date().toISOString();

    // Basic de-dupe check before insert.
    let existingQuery = supabase.from('custom_product_competitor_pricing').select('*').limit(1);
    if (manualCols.has('custom_product_id')) existingQuery = existingQuery.eq('custom_product_id', customProductId);
    if (manualCols.has('custom_catalog_product_id')) existingQuery = existingQuery.eq('custom_catalog_product_id', customProductId);
    if (manualCols.has('competitor_name') && scraped.competitor_name) existingQuery = existingQuery.eq('competitor_name', scraped.competitor_name);
    if (manualCols.has('product_name') && scraped.product_name) existingQuery = existingQuery.eq('product_name', scraped.product_name);
    if (manualCols.has('variant') && scraped.variant) existingQuery = existingQuery.eq('variant', scraped.variant);

    existingQuery = applyOrgScope(existingQuery, manualCols, ctx.orgId);
    const existingRes = await existingQuery.maybeSingle();
    if (existingRes.data) {
      return NextResponse.json({
        success: true,
        imported: false,
        reason: 'already_exists',
        record: normalizeManualRow(existingRes.data),
      });
    }

    const payload: AnyRecord = {};
    if (manualCols.has('organization_id')) payload.organization_id = ctx.orgId;
    if (manualCols.has('org_id')) payload.org_id = ctx.orgId;
    if (manualCols.has('custom_product_id')) payload.custom_product_id = customProductId;
    if (manualCols.has('custom_catalog_product_id')) payload.custom_catalog_product_id = customProductId;
    if (manualCols.has('competitor_name')) payload.competitor_name = scraped.competitor_name;
    if (manualCols.has('competitor')) payload.competitor = scraped.competitor_name;
    if (manualCols.has('product_name')) payload.product_name = scraped.product_name;
    if (manualCols.has('competitor_product_name')) payload.competitor_product_name = scraped.product_name;
    if (manualCols.has('variant')) payload.variant = scraped.variant;
    if (manualCols.has('category')) payload.category = scraped.category;
    if (manualCols.has('min_qty')) payload.min_qty = scraped.min_qty;
    if (manualCols.has('minimum_qty')) payload.minimum_qty = scraped.min_qty;
    if (manualCols.has('unit_price')) payload.unit_price = scraped.unit_price;
    if (manualCols.has('price')) payload.price = scraped.unit_price;
    if (manualCols.has('source_url')) payload.source_url = scraped.source_url;
    if (manualCols.has('scraped_at')) payload.scraped_at = scraped.scraped_at ?? now;
    if (manualCols.has('scrape_date')) payload.scrape_date = scraped.scraped_at ?? now;
    if (manualCols.has('source')) payload.source = 'scraped_import';
    if (manualCols.has('imported_from_scraped_id')) payload.imported_from_scraped_id = scrapedId;
    if (manualCols.has('created_by') && ctx.authUserId) payload.created_by = ctx.authUserId;
    if (manualCols.has('created_at')) payload.created_at = now;
    if (manualCols.has('updated_at')) payload.updated_at = now;

    const insertRes = await supabase
      .from('custom_product_competitor_pricing')
      .insert(payload)
      .select('*')
      .single();

    if (insertRes.error) {
      return NextResponse.json(
        { error: insertRes.error.message || 'Failed to import scraped price' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      imported: true,
      record: normalizeManualRow(insertRes.data),
    });
  } catch (error) {
    console.error('[competitor-pricing] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

