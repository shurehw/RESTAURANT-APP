/**
 * lib/integrations/square.ts
 * Fetches sales data from Square API and syncs to canonical POS model.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface SquareOrderLineItem {
  uid: string;
  catalogObjectId?: string;
  name: string;
  quantity: string;
  totalMoney: { amount: number; currency: string };
}

interface SquareOrder {
  id: string;
  lineItems: SquareOrderLineItem[];
}

interface SquareOrderSearchResponse {
  orders: SquareOrder[];
}

/**
 * Fetches orders from Square API for a given date range.
 * @param locationId - Square location ID
 * @param startDate - ISO datetime string (YYYY-MM-DDTHH:mm:ssZ)
 * @param endDate - ISO datetime string
 * @param accessToken - Square access token
 * @returns Array of line items aggregated across orders
 */
export async function fetchSquareOrders(
  locationId: string,
  startDate: string,
  endDate: string,
  accessToken: string
): Promise<SquareOrderLineItem[]> {
  const url = `https://connect.squareup.com/v2/orders/search`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18', // Update to latest API version
    },
    body: JSON.stringify({
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: {
            created_at: {
              start_at: startDate,
              end_at: endDate,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Square API error: ${response.status} ${response.statusText}`
    );
  }

  const data: SquareOrderSearchResponse = await response.json();
  const lineItems: SquareOrderLineItem[] = [];

  for (const order of data.orders || []) {
    lineItems.push(...(order.lineItems || []));
  }

  return lineItems;
}

/**
 * Aggregates line items by catalog object ID.
 */
function aggregateLineItems(
  items: SquareOrderLineItem[]
): Map<string, { name: string; qty: number; revenue: number }> {
  const agg = new Map<
    string,
    { name: string; qty: number; revenue: number }
  >();

  for (const item of items) {
    const key = item.catalogObjectId || item.uid;
    const qty = parseFloat(item.quantity);
    const revenue = item.totalMoney.amount / 100; // Square amounts are in cents

    if (agg.has(key)) {
      const existing = agg.get(key)!;
      existing.qty += qty;
      existing.revenue += revenue;
    } else {
      agg.set(key, { name: item.name, qty, revenue });
    }
  }

  return agg;
}

/**
 * Syncs Square sales to canonical pos_sales table.
 * Creates/updates menu_items and inserts daily pos_sales facts.
 * @param venueId - Venue UUID
 * @param businessDate - ISO date string (YYYY-MM-DD)
 * @param supabase - Supabase client
 */
export async function syncSquareSales(
  venueId: string,
  businessDate: string,
  supabase: SupabaseClient
) {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN!;
  const locationId = process.env.SQUARE_LOCATION_ID!;

  if (!accessToken || !locationId) {
    throw new Error('Square API credentials not configured');
  }

  // Fetch orders for the business date (00:00 - 23:59)
  const startDate = `${businessDate}T00:00:00Z`;
  const endDate = `${businessDate}T23:59:59Z`;

  const lineItems = await fetchSquareOrders(
    locationId,
    startDate,
    endDate,
    accessToken
  );

  const aggregated = aggregateLineItems(lineItems);

  for (const [externalId, data] of aggregated) {
    // 1. Upsert menu_item
    const { data: menuItem, error: menuError } = await supabase
      .from('menu_items')
      .upsert(
        {
          venue_id: venueId,
          external_id: externalId,
          name: data.name,
          price: data.qty > 0 ? data.revenue / data.qty : 0,
          is_active: true,
        },
        { onConflict: 'venue_id,external_id' }
      )
      .select()
      .single();

    if (menuError) {
      console.error('Error upserting menu item:', menuError);
      continue;
    }

    // 2. Insert pos_sales fact
    const { error: salesError } = await supabase.from('pos_sales').insert({
      venue_id: venueId,
      business_date: businessDate,
      menu_item_id: menuItem.id,
      qty: data.qty,
      net_revenue: data.revenue,
    });

    if (salesError) {
      console.error('Error inserting pos_sales:', salesError);
    }
  }

  console.log(
    `Square sync complete: ${aggregated.size} items for ${businessDate}`
  );
}
