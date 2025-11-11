import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':recipes-create');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const { name, recipe_type, item_category, category, yield_qty, yield_uom, labor_minutes, menu_price, pos_sku, food_cost_target, components } = body;

    if (!name || !recipe_type || !yield_qty || !yield_uom) {
      throw { status: 400, code: 'MISSING_FIELDS', message: 'Missing required fields' };
    }
    if (!components || components.length === 0) {
      throw { status: 400, code: 'NO_COMPONENTS', message: 'Recipe must have at least one component' };
    }

    const venueId = venueIds[0];
    const supabase = await createClient();

    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        venue_id: venueId,
        name: name.trim(),
        recipe_type,
        item_category: item_category || 'food',
        category: category?.trim() || null,
        yield_qty,
        yield_uom: yield_uom.trim(),
        labor_minutes: labor_minutes || 0,
        menu_price: menu_price || null,
        pos_sku: pos_sku?.trim() || null,
        food_cost_target: food_cost_target || 28,
        created_by: user.id,
      })
      .select()
      .single();

    if (recipeError) throw recipeError;

    const componentData = components.map((comp: any) => ({
      recipe_id: recipe.id,
      item_id: comp.type === 'item' ? comp.itemId : null,
      sub_recipe_id: comp.type === 'sub_recipe' ? comp.subRecipeId : null,
      qty: comp.qty,
      uom: comp.uom,
    }));

    const { error: componentsError } = await supabase.from('recipe_items').insert(componentData);
    if (componentsError) {
      await supabase.from('recipes').delete().eq('id', recipe.id);
      throw componentsError;
    }

    const { data: costData } = await supabase
      .from('v_recipe_costs')
      .select('line_cost')
      .eq('recipe_id', recipe.id);

    const ingredientCost = costData?.reduce((sum, row) => sum + (row.line_cost || 0), 0) || 0;
    const laborCost = (labor_minutes / 60) * 15;
    const totalCost = ingredientCost + laborCost;
    const costPerUnit = yield_qty > 0 ? totalCost / yield_qty : 0;

    await supabase.from('recipes').update({ cost_per_unit: costPerUnit }).eq('id', recipe.id);

    return NextResponse.json({ success: true, recipe: { ...recipe, cost_per_unit: costPerUnit } });
  });
}

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':recipes-list');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const category = searchParams.get('category');

    const supabase = await createClient();
    let query = supabase
      .from('recipes')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (type) query = query.eq('recipe_type', type);
    if (category) query = query.eq('item_category', category);

    const { data: recipes, error } = await query;
    if (error) throw error;

    return NextResponse.json({ recipes });
  });
}
