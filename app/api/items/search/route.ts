import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':items-search');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const vendorId = searchParams.get('vendor_id');
    const includeRecipes = searchParams.get('include_recipes') === 'true';

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ items: [], recipes: [] });
    }

    const supabase = await createClient();
    let itemsQuery = supabase
      .from('items')
      .select('id, sku, name, category, subcategory, base_uom')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
      .limit(10);

    const { data: items } = await itemsQuery;

    const itemsWithCosts = await Promise.all(
      (items || []).map(async (item) => {
        const { data: costHistory } = await supabase
          .from('item_cost_history')
          .select('unit_cost')
          .eq('item_id', item.id)
          .order('effective_date', { ascending: false })
          .limit(1)
          .single();
        return { ...item, unit_cost: costHistory?.unit_cost || 0 };
      })
    );

    if (vendorId) {
      const { data: vendorItems } = await supabase
        .from('vendor_items')
        .select('id, item_id, vendor_description, item:items(id, sku, name, category, base_uom)')
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .ilike('vendor_description', `%${query}%`)
        .limit(5);

      const vendorMatchedItems = vendorItems?.map(vi => ({ ...vi.item, isVendorMatch: true, vendorItemId: vi.id })) || [];
      const allItems = [...vendorMatchedItems, ...itemsWithCosts.filter(item => !vendorMatchedItems.find(vi => vi.id === item.id))];
      const finalItems = allItems.slice(0, 10);

      let recipes = [];
      if (includeRecipes) {
        const { data: recipeData } = await supabase
          .from('recipes')
          .select('id, name, recipe_type, item_category, category, yield_uom, cost_per_unit')
          .eq('is_active', true)
          .ilike('name', `%${query}%`)
          .order('name', { ascending: true })
          .limit(10);
        recipes = recipeData || [];
      }

      return NextResponse.json({ items: finalItems, recipes });
    }

    let recipes = [];
    if (includeRecipes) {
      const { data: recipeData } = await supabase
        .from('recipes')
        .select('id, name, recipe_type, item_category, category, yield_uom, cost_per_unit')
        .eq('is_active', true)
        .ilike('name', `%${query}%`)
        .order('name', { ascending: true })
        .limit(10);
      recipes = recipeData || [];
    }

    return NextResponse.json({ items: itemsWithCosts || [], recipes });
  });
}
