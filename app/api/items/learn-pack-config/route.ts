import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { extractBrand } from '@/lib/brand-extraction';
import { cookies } from 'next/headers';

/**
 * POST /api/items/learn-pack-config
 * Learn pack configurations from existing items by brand
 * Also provides web search fallback for unknown products
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();
    const body = await request.json();
    const { description, vendor_name } = body;

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    // Extract brand from description
    const brand = extractBrand(description);

    let learnedConfig = null;
    let webSearchConfig = null;

    // Get user ID from cookie (our custom auth) or Supabase session
    const cookieStore = await cookies();
    let userId: string | null = null;

    // Try Supabase session first
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      // Fallback to custom user_id cookie
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    const orgId = orgUsers[0].organization_id;

    // If brand found, learn from existing items
    if (brand) {
      const { data: existingItems } = await supabase
        .from('items')
        .select('id, name, item_pack_configurations(pack_type, units_per_pack, unit_size, unit_size_uom)')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .ilike('name', `%${brand}%`)
        .limit(20);

      if (existingItems && existingItems.length > 0) {
        // Aggregate pack configs to find most common pattern
        const packConfigMap = new Map<string, number>();

        for (const item of existingItems) {
          const configs = (item as any).item_pack_configurations;
          if (configs && configs.length > 0) {
            // Use first pack config from each item
            const config = configs[0];
            const key = `${config.pack_type}|${config.units_per_pack}|${config.unit_size}|${config.unit_size_uom}`;
            packConfigMap.set(key, (packConfigMap.get(key) || 0) + 1);
          }
        }

        // Find most common pack config
        let mostCommon: string | null = null;
        let maxCount = 0;

        for (const [key, count] of packConfigMap.entries()) {
          if (count > maxCount) {
            maxCount = count;
            mostCommon = key;
          }
        }

        if (mostCommon) {
          const [pack_type, units_per_pack, unit_size, unit_size_uom] = mostCommon.split('|');
          learnedConfig = {
            pack_type,
            units_per_pack: parseFloat(units_per_pack),
            unit_size: parseFloat(unit_size),
            unit_size_uom,
            source: 'learned',
            confidence: maxCount >= 3 ? 'high' : maxCount >= 2 ? 'medium' : 'low',
            sample_count: maxCount,
            brand,
          };
        }
      }
    }

    // If no learned config and description looks like a beverage, try web search
    if (!learnedConfig) {
      const isBeverage = /(liquor|wine|beer|vodka|gin|rum|whiskey|tequila|bourbon|bitters|vermouth|liqueur|spirit|aperitif)/i.test(description);

      if (isBeverage) {
        // Search query: brand + product + "case size" or "bottle size"
        const searchQuery = `${description} case size bottle size specifications`;

        try {
          // Use web search to find pack configuration
          const searchResponse = await fetch('https://api.websearch.anthropic.com/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: searchQuery }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            // Parse search results for pack size info
            // This is a simplified implementation - in production you'd use AI to extract structured data
            const resultsText = JSON.stringify(searchData).toLowerCase();

            // Look for common patterns like "12 pack", "750ml", etc.
            const caseMatch = resultsText.match(/(\d+)\s*(pack|case|count)/i);
            const sizeMatch = resultsText.match(/(\d+\.?\d*)\s*(ml|oz|l)/i);

            if (caseMatch || sizeMatch) {
              webSearchConfig = {
                pack_type: 'case',
                units_per_pack: caseMatch ? parseInt(caseMatch[1]) : 1,
                unit_size: sizeMatch ? parseFloat(sizeMatch[1]) : 750,
                unit_size_uom: sizeMatch ? sizeMatch[2] : 'ml',
                source: 'web_search',
                confidence: 'low',
                brand: brand || 'unknown',
              };
            }
          }
        } catch (error) {
          console.error('Web search failed:', error);
          // Continue without web search data
        }
      }
    }

    return NextResponse.json({
      learned: learnedConfig,
      web_search: webSearchConfig,
      brand,
    });
  });
}
