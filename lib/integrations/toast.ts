/**
 * lib/integrations/toast.ts
 * Toast POS direct API integration.
 *
 * Supports two modes:
 * 1. Orders API v2 — full order-level data for ETL into venue_day_facts
 * 2. Sales Mix API — item-level summary for menu analysis
 *
 * Per-venue credentials stored in toast_venue_config table (migration 276).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface ToastVenueConfig {
  venue_id: string;
  restaurant_guid: string;
  client_id: string;
  client_secret: string; // decrypted
  api_base: string;
}

export interface ToastOrder {
  guid: string;
  openedDate: string;
  closedDate: string | null;
  voidDate: string | null;
  guestCount: number;
  numberOfGuests?: number;
  server: { guid: string; firstName: string; lastName: string } | null;
  table: { name: string } | null;
  checks: Array<{
    totalAmount: number;
    amount: number; // subtotal before tax
    tipAmount: number;
    taxAmount: number;
    selections: Array<{
      guid: string;
      displayName: string;
      quantity: number;
      price: number;
      salesCategory: { guid: string; name: string } | null;
      voidDate: string | null;
      modifiers: any[];
    }>;
    appliedDiscounts: Array<{
      name: string;
      discountAmount: number;
      approver: { firstName: string; lastName: string } | null;
    }>;
  }>;
}

export interface ToastDaySummary {
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  wine_sales: number;
  liquor_sales: number;
  beer_sales: number;
  other_sales: number;
  comps_total: number;
  voids_total: number;
  taxes_total: number;
  tips_total: number;
  checks_count: number;
  covers_count: number;
  items_sold: number;
}

export interface ToastIntraDaySummary {
  total_checks: number;
  total_covers: number;
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  other_sales: number;
  comps_total: number;
  voids_total: number;
}

export interface ToastServerSummary {
  employee_name: string;
  employee_role: string | null;
  gross_sales: number;
  checks_count: number;
  covers_count: number;
  tips_total: number;
  comps_total: number;
}

export interface ToastItemSummary {
  menu_item_name: string;
  category: string | null;
  parent_category: string | null;
  quantity_sold: number;
  gross_sales: number;
  net_sales: number;
  comps_total: number;
  voids_total: number;
}

// ══════════════════════════════════════════════════════════════════════════
// ENCRYPTION (AES-256-GCM for API keys at rest)
// ══════════════════════════════════════════════════════════════════════════

const ENCRYPTION_KEY = process.env.TOAST_ENCRYPTION_KEY || '';

export function encryptApiKey(plaintext: string): string {
  if (!ENCRYPTION_KEY) {
    // Fallback: base64 only (dev mode)
    return `b64:${Buffer.from(plaintext).toString('base64')}`;
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(ciphertext: string): string {
  if (ciphertext.startsWith('b64:')) {
    return Buffer.from(ciphertext.slice(4), 'base64').toString('utf8');
  }
  if (!ENCRYPTION_KEY) throw new Error('TOAST_ENCRYPTION_KEY required for decryption');
  const [, ivHex, tagHex, encHex] = ciphertext.split(':');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

// ══════════════════════════════════════════════════════════════════════════
// CONFIG LOOKUP
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get Toast config for a venue. Returns null if venue is not a Toast venue.
 */
export async function getToastVenueConfig(venueId: string): Promise<ToastVenueConfig | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('toast_venue_config')
    .select('venue_id, restaurant_guid, client_id, client_secret_encrypted, api_base')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  return {
    venue_id: data.venue_id,
    restaurant_guid: data.restaurant_guid,
    client_id: data.client_id,
    client_secret: decryptApiKey(data.client_secret_encrypted),
    api_base: data.api_base,
  };
}

/**
 * Get all active Toast venue configs.
 */
export async function getActiveToastVenues(): Promise<Array<{
  venue_id: string;
  venue_name: string;
  restaurant_guid: string;
}>> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('toast_venue_config')
    .select('venue_id, restaurant_guid, venues!inner(name)')
    .eq('is_active', true);

  if (error || !data) return [];

  return data.map((row: any) => ({
    venue_id: row.venue_id,
    venue_name: row.venues?.name || 'Unknown',
    restaurant_guid: row.restaurant_guid,
  }));
}

/**
 * Update sync status after ETL run.
 */
export async function updateToastSyncStatus(
  venueId: string,
  status: 'success' | 'error' | 'partial',
  error?: string
): Promise<void> {
  const supabase = getServiceClient();
  await (supabase as any)
    .from('toast_venue_config')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('venue_id', venueId);
}

// ══════════════════════════════════════════════════════════════════════════
// TOAST OAUTH2 AUTHENTICATION (TOAST_MACHINE_CLIENT)
// ══════════════════════════════════════════════════════════════════════════

// In-memory token cache: keyed by client_id
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/**
 * Authenticate with Toast OAuth2 using client credentials flow.
 * POST /authentication/v1/authentication/login
 *
 * Returns a Bearer access token. Caches tokens until 5 min before expiry.
 */
async function getToastAccessToken(config: ToastVenueConfig): Promise<string> {
  // Check cache
  const cached = tokenCache.get(config.client_id);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) {
    return cached.accessToken;
  }

  const response = await fetch(
    `${config.api_base}/authentication/v1/authentication/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: config.client_id,
        clientSecret: config.client_secret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Toast auth failed: ${response.status} ${response.statusText} ${text}`);
  }

  const data = await response.json();
  const token = data.token || data;
  const accessToken = token.accessToken;
  const expiresIn = token.expiresIn || 86400; // default 24h

  if (!accessToken) {
    throw new Error('Toast auth response missing accessToken');
  }

  // Cache the token
  tokenCache.set(config.client_id, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

// ══════════════════════════════════════════════════════════════════════════
// TOAST API CLIENT
// ══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all orders for a business date from Toast Orders API v2.
 * Handles OAuth2 authentication and pagination (100 orders per page).
 */
export async function fetchToastOrders(
  config: ToastVenueConfig,
  businessDate: string
): Promise<ToastOrder[]> {
  const accessToken = await getToastAccessToken(config);
  const bdate = businessDate.replace(/-/g, ''); // YYYYMMDD format
  const url = `${config.api_base}/orders/v2/orders`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Toast-Restaurant-External-ID': config.restaurant_guid,
    'Content-Type': 'application/json',
  };

  const allOrders: ToastOrder[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ businessDate: bdate });
    if (page > 1) params.set('pageToken', String(page));

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(60_000),
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Toast Orders API error: ${response.status} ${response.statusText}`);
    }

    const orders: ToastOrder[] = await response.json();
    if (!orders || orders.length === 0) break;

    allOrders.push(...orders);

    // Toast paginates at 100 per page
    if (orders.length < 100) break;
    page++;
  }

  return allOrders;
}

/**
 * Test Toast API connectivity. Authenticates via OAuth2, then tries a lightweight API call.
 */
export async function testToastConnection(
  restaurantGuid: string,
  clientId: string,
  clientSecret: string,
  apiBase: string = 'https://ws-api.toasttab.com'
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Step 1: Authenticate
    const authResponse = await fetch(
      `${apiBase}/authentication/v1/authentication/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          userAccessType: 'TOAST_MACHINE_CLIENT',
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!authResponse.ok) {
      return { ok: false, error: `Auth failed: HTTP ${authResponse.status}` };
    }

    const authData = await authResponse.json();
    const accessToken = authData.token?.accessToken || authData.accessToken;
    if (!accessToken) {
      return { ok: false, error: 'Auth response missing accessToken' };
    }

    // Step 2: Try a lightweight API call
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const response = await fetch(
      `${apiBase}/orders/v2/orders?businessDate=${today}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Toast-Restaurant-External-ID': restaurantGuid,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (response.ok || response.status === 404) {
      return { ok: true };
    }
    return { ok: false, error: `API call failed: HTTP ${response.status}` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DATA AGGREGATION
// ══════════════════════════════════════════════════════════════════════════

// Category classification (matches tipsee-sync.ts CATEGORY_MAPPING)
const TOAST_CATEGORY_MAP: Record<string, 'food' | 'beverage' | 'wine' | 'liquor' | 'beer' | 'other'> = {
  'Food': 'food', 'FOOD': 'food', 'Entree': 'food', 'Entrees': 'food',
  'Appetizer': 'food', 'Appetizers': 'food', 'Dessert': 'food', 'Desserts': 'food',
  'Side': 'food', 'Sides': 'food', 'Salad': 'food', 'Salads': 'food',
  'Soup': 'food', 'Soups': 'food', 'Starter': 'food', 'Starters': 'food',
  'Main': 'food', 'Mains': 'food', 'Cheese': 'food',
  'Beverage': 'beverage', 'BEVERAGE': 'beverage', 'Drinks': 'beverage',
  'Non-Alcoholic': 'beverage', 'Soft Drinks': 'beverage', 'Coffee': 'beverage', 'Tea': 'beverage',
  'Wine': 'wine', 'WINE': 'wine', 'Wine by Glass': 'wine', 'Wine by Bottle': 'wine',
  'BTG': 'wine', 'BTB': 'wine', 'Wines': 'wine',
  'Liquor': 'liquor', 'LIQUOR': 'liquor', 'Spirits': 'liquor',
  'Cocktail': 'liquor', 'Cocktails': 'liquor',
  'Beer': 'beer', 'BEER': 'beer', 'Beers': 'beer', 'Draft': 'beer',
};

function classifyCategory(categoryName: string | null): 'food' | 'beverage' | 'wine' | 'liquor' | 'beer' | 'other' {
  if (!categoryName) return 'other';
  // Exact match first
  if (TOAST_CATEGORY_MAP[categoryName]) return TOAST_CATEGORY_MAP[categoryName];
  // Case-insensitive substring match
  const lower = categoryName.toLowerCase();
  if (lower.includes('wine')) return 'wine';
  if (lower.includes('cocktail') || lower.includes('spirit') || lower.includes('liquor')) return 'liquor';
  if (lower.includes('beer') || lower.includes('draft')) return 'beer';
  if (lower.includes('bev') || lower.includes('drink') || lower.includes('coffee') || lower.includes('tea')) return 'beverage';
  if (lower.includes('food') || lower.includes('entree') || lower.includes('appetizer') || lower.includes('dessert') || lower.includes('salad') || lower.includes('soup')) return 'food';
  return 'other';
}

/**
 * Aggregate Toast orders into a day-level summary (maps to venue_day_facts schema).
 */
export function aggregateToastOrders(orders: ToastOrder[]): ToastDaySummary {
  const summary: ToastDaySummary = {
    gross_sales: 0, net_sales: 0,
    food_sales: 0, beverage_sales: 0, wine_sales: 0,
    liquor_sales: 0, beer_sales: 0, other_sales: 0,
    comps_total: 0, voids_total: 0, taxes_total: 0,
    tips_total: 0, checks_count: 0, covers_count: 0, items_sold: 0,
  };

  for (const order of orders) {
    // Skip voided orders
    if (order.voidDate) continue;

    summary.checks_count++;
    summary.covers_count += Math.max(1, order.guestCount || order.numberOfGuests || 1);

    for (const check of order.checks || []) {
      summary.gross_sales += check.totalAmount || 0;
      summary.net_sales += check.amount || 0;
      summary.tips_total += check.tipAmount || 0;
      summary.taxes_total += check.taxAmount || 0;

      // Comps from applied discounts
      for (const disc of check.appliedDiscounts || []) {
        summary.comps_total += Math.abs(disc.discountAmount || 0);
      }

      // Item-level categorization
      for (const sel of check.selections || []) {
        if (sel.voidDate) {
          summary.voids_total += Math.abs(sel.price * sel.quantity);
          continue;
        }

        const itemTotal = sel.price * sel.quantity;
        summary.items_sold += sel.quantity;
        const cat = classifyCategory(sel.salesCategory?.name ?? null);

        switch (cat) {
          case 'food': summary.food_sales += itemTotal; break;
          case 'wine': summary.wine_sales += itemTotal; break;
          case 'liquor': summary.liquor_sales += itemTotal; break;
          case 'beer': summary.beer_sales += itemTotal; break;
          case 'beverage': summary.beverage_sales += itemTotal; break;
          default: summary.other_sales += itemTotal; break;
        }
      }
    }
  }

  // Beverage_sales is the sum of all drink categories
  summary.beverage_sales += summary.wine_sales + summary.liquor_sales + summary.beer_sales;

  // Round everything to 2 decimal places
  for (const key of Object.keys(summary) as Array<keyof ToastDaySummary>) {
    if (typeof summary[key] === 'number') {
      (summary as any)[key] = Math.round((summary[key] as number) * 100) / 100;
    }
  }

  return summary;
}

/**
 * Aggregate Toast orders into per-server summaries.
 */
export function aggregateToastServers(orders: ToastOrder[]): ToastServerSummary[] {
  const byServer = new Map<string, ToastServerSummary>();

  for (const order of orders) {
    if (order.voidDate) continue;

    const serverName = order.server
      ? `${order.server.firstName || ''} ${order.server.lastName || ''}`.trim()
      : 'Unknown';

    if (!byServer.has(serverName)) {
      byServer.set(serverName, {
        employee_name: serverName,
        employee_role: null,
        gross_sales: 0, checks_count: 0, covers_count: 0,
        tips_total: 0, comps_total: 0,
      });
    }

    const s = byServer.get(serverName)!;
    s.checks_count++;
    s.covers_count += Math.max(1, order.guestCount || order.numberOfGuests || 1);

    for (const check of order.checks || []) {
      s.gross_sales += check.totalAmount || 0;
      s.tips_total += check.tipAmount || 0;
      for (const disc of check.appliedDiscounts || []) {
        s.comps_total += Math.abs(disc.discountAmount || 0);
      }
    }
  }

  return Array.from(byServer.values());
}

/**
 * Aggregate Toast orders into per-item summaries (top items by revenue).
 */
export function aggregateToastItems(orders: ToastOrder[]): ToastItemSummary[] {
  const byItem = new Map<string, ToastItemSummary>();

  for (const order of orders) {
    if (order.voidDate) continue;

    for (const check of order.checks || []) {
      for (const sel of check.selections || []) {
        const key = sel.displayName || sel.guid;
        if (!byItem.has(key)) {
          byItem.set(key, {
            menu_item_name: sel.displayName || 'Unknown',
            category: sel.salesCategory?.name || null,
            parent_category: null,
            quantity_sold: 0, gross_sales: 0, net_sales: 0,
            comps_total: 0, voids_total: 0,
          });
        }

        const item = byItem.get(key)!;
        if (sel.voidDate) {
          item.voids_total += Math.abs(sel.price * sel.quantity);
        } else {
          item.quantity_sold += sel.quantity;
          item.gross_sales += sel.price * sel.quantity;
          item.net_sales += sel.price * sel.quantity;
        }
      }

      // Distribute discounts proportionally would be complex;
      // for now, comps are tracked at the check level only
    }
  }

  // Return top 100 by revenue
  return Array.from(byItem.values())
    .sort((a, b) => b.gross_sales - a.gross_sales)
    .slice(0, 100);
}

/**
 * Build an intra-day summary (for live polling during service).
 * Same shape as TipSee's fetchIntraDaySummary result.
 */
export async function fetchToastIntraDaySummary(
  venueId: string,
  businessDate: string
): Promise<ToastIntraDaySummary> {
  const config = await getToastVenueConfig(venueId);
  if (!config) {
    return { total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0, food_sales: 0, beverage_sales: 0, other_sales: 0, comps_total: 0, voids_total: 0 };
  }

  const orders = await fetchToastOrders(config, businessDate);
  const day = aggregateToastOrders(orders);

  return {
    total_checks: day.checks_count,
    total_covers: day.covers_count,
    gross_sales: day.gross_sales,
    net_sales: day.net_sales,
    food_sales: day.food_sales,
    beverage_sales: day.beverage_sales,
    other_sales: day.other_sales,
    comps_total: day.comps_total,
    voids_total: day.voids_total,
  };
}
