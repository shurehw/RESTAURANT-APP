/**
 * lib/integrations/toast.ts
 * Fetches sales mix from Toast API and syncs to canonical POS model.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface ToastSalesMixItem {
  guid: string;
  name: string;
  quantity: number;
  netSales: number;
  grossSales: number;
}

interface ToastSalesMixResponse {
  menuItems: ToastSalesMixItem[];
}

/**
 * Fetches sales mix from Toast API for a given date range.
 * @param restaurantGuid - Toast restaurant external ID
 * @param startDate - ISO date string (YYYY-MM-DD)
 * @param endDate - ISO date string (YYYY-MM-DD)
 * @param apiKey - Toast API key (Bearer token)
 * @returns Array of sales mix items
 */
export async function fetchToastSalesMix(
  restaurantGuid: string,
  startDate: string,
  endDate: string,
  apiKey: string
): Promise<ToastSalesMixItem[]> {
  const url = `https://api.toasttab.com/reporting/v1/reports/salesMix`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Toast-Restaurant-External-ID': restaurantGuid,
    },
    body: JSON.stringify({
      startDate,
      endDate,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Toast API error: ${response.status} ${response.statusText}`
    );
  }

  const data: ToastSalesMixResponse = await response.json();
  return data.menuItems || [];
}

/**
 * Syncs Toast sales mix to canonical pos_sales table.
 * Creates/updates menu_items and inserts daily pos_sales facts.
 * @param venueId - Venue UUID
 * @param businessDate - ISO date string for the sales day
 * @param supabase - Supabase client
 */
export async function syncToastSales(
  venueId: string,
  businessDate: string,
  supabase: SupabaseClient
) {
  const apiKey = process.env.TOAST_API_KEY!;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;

  if (!apiKey || !restaurantGuid) {
    throw new Error('Toast API credentials not configured');
  }

  const salesMix = await fetchToastSalesMix(
    restaurantGuid,
    businessDate,
    businessDate,
    apiKey
  );

  for (const item of salesMix) {
    // 1. Upsert menu_item
    const { data: menuItem, error: menuError } = await supabase
      .from('menu_items')
      .upsert(
        {
          venue_id: venueId,
          external_id: item.guid,
          name: item.name,
          price: item.quantity > 0 ? item.netSales / item.quantity : 0,
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
      qty: item.quantity,
      net_revenue: item.netSales,
    });

    if (salesError) {
      console.error('Error inserting pos_sales:', salesError);
    }
  }

  console.log(
    `Toast sync complete: ${salesMix.length} items for ${businessDate}`
  );
}
