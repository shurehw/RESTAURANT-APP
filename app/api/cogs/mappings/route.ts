import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/cogs/mappings?venue_id=xxx[&unmapped=true]
 * List menu item → recipe mappings for a venue
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const venueId = req.nextUrl.searchParams.get('venue_id');
  if (!venueId) return NextResponse.json({ error: 'venue_id required' }, { status: 400 });

  const unmappedOnly = req.nextUrl.searchParams.get('unmapped') === 'true';

  // Get mappings with 30-day sales context from item_day_facts
  let query = supabase
    .from('menu_item_recipe_map')
    .select(`
      id,
      venue_id,
      menu_item_name,
      recipe_id,
      is_active,
      confidence,
      mapped_by,
      mapped_at,
      recipes:recipe_id (id, name, cost_per_unit, item_category)
    `)
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('menu_item_name');

  if (unmappedOnly) {
    query = query.is('recipe_id', null);
  }

  const { data: mappings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get 30-day sales totals per item for sorting context
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: salesData } = await supabase
    .from('item_day_facts')
    .select('menu_item_name, net_sales, quantity_sold')
    .eq('venue_id', venueId)
    .gte('business_date', thirtyDaysAgo.toISOString().split('T')[0]);

  // Aggregate sales per item
  const salesByItem = new Map<string, { net_sales: number; quantity_sold: number }>();
  for (const row of (salesData || [])) {
    const existing = salesByItem.get(row.menu_item_name) || { net_sales: 0, quantity_sold: 0 };
    existing.net_sales += row.net_sales || 0;
    existing.quantity_sold += row.quantity_sold || 0;
    salesByItem.set(row.menu_item_name, existing);
  }

  // Merge sales context into mappings
  const result = (mappings || []).map((m: any) => ({
    ...m,
    sales_30d: salesByItem.get(m.menu_item_name)?.net_sales || 0,
    qty_30d: salesByItem.get(m.menu_item_name)?.quantity_sold || 0,
  }));

  // Sort by 30d sales descending
  result.sort((a: any, b: any) => b.sales_30d - a.sales_30d);

  // Get coverage stats
  const { data: coverage } = await supabase
    .from('v_menu_item_mapping_coverage')
    .select('*')
    .eq('venue_id', venueId)
    .single();

  return NextResponse.json({ mappings: result, coverage });
}

/**
 * PUT /api/cogs/mappings
 * Update a mapping (set recipe_id)
 * Body: { id, recipe_id } or { venue_id, menu_item_name, recipe_id }
 */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, venue_id, menu_item_name, recipe_id } = body;

  if (!id && !(venue_id && menu_item_name)) {
    return NextResponse.json({ error: 'id or (venue_id + menu_item_name) required' }, { status: 400 });
  }

  const updates = {
    recipe_id: recipe_id || null,
    confidence: recipe_id ? 'manual' : 'auto_discovered',
    mapped_by: recipe_id ? user.id : null,
    mapped_at: recipe_id ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  let query = supabase.from('menu_item_recipe_map').update(updates);
  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('venue_id', venue_id).eq('menu_item_name', menu_item_name);
  }

  const { data, error } = await query.select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ mapping: data });
}

/**
 * POST /api/cogs/mappings
 * Auto-match: find menu items where name matches a recipe name (case-insensitive)
 * Body: { venue_id }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { venue_id } = body;
  if (!venue_id) return NextResponse.json({ error: 'venue_id required' }, { status: 400 });

  // Get unmapped items
  const { data: unmapped } = await supabase
    .from('menu_item_recipe_map')
    .select('id, menu_item_name')
    .eq('venue_id', venue_id)
    .eq('is_active', true)
    .is('recipe_id', null);

  if (!unmapped || unmapped.length === 0) {
    return NextResponse.json({ matched: 0, message: 'No unmapped items' });
  }

  // Get recipes for this venue (or global recipes with no venue_id)
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('is_active', true)
    .or(`venue_id.eq.${venue_id},venue_id.is.null`);

  if (!recipes || recipes.length === 0) {
    return NextResponse.json({ matched: 0, message: 'No recipes found' });
  }

  // Build case-insensitive lookup
  const recipeByName = new Map<string, string>();
  for (const r of recipes) {
    recipeByName.set(r.name.toLowerCase().trim(), r.id);
  }

  // Match
  let matched = 0;
  for (const item of unmapped) {
    const recipeId = recipeByName.get(item.menu_item_name.toLowerCase().trim());
    if (recipeId) {
      await supabase
        .from('menu_item_recipe_map')
        .update({
          recipe_id: recipeId,
          confidence: 'auto_exact',
          mapped_by: user.id,
          mapped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      matched++;
    }
  }

  return NextResponse.json({ matched, total_unmapped: unmapped.length });
}
