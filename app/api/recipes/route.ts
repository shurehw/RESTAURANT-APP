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
    const { name, recipe_type, item_category, category, yield_qty, yield_uom, labor_minutes, menu_price, pos_sku, food_cost_target, components, venue_id } = body;

    if (!name || !recipe_type || !yield_qty || !yield_uom) {
      throw { status: 400, code: 'MISSING_FIELDS', message: 'Missing required fields' };
    }
    if (!components || components.length === 0) {
      throw { status: 400, code: 'NO_COMPONENTS', message: 'Recipe must have at least one component' };
    }

    // Use provided venue_id if valid, otherwise default to first venue
    let venueId = venue_id;
    if (!venueId || !venueIds.includes(venueId)) {
      venueId = venueIds[0];
    }

    const supabase = await createClient();

    // Get venue's labor rate
    const { data: venue } = await supabase
      .from('venues')
      .select('labor_rate_per_hour')
      .eq('id', venueId)
      .single();
    
    const laborRate = venue?.labor_rate_per_hour || 15;

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

    // Insert components - trigger will auto-calculate cost
    const { error: componentsError } = await supabase.from('recipe_items').insert(componentData);
    if (componentsError) {
      await supabase.from('recipes').delete().eq('id', recipe.id);
      throw componentsError;
    }

    // Fetch updated recipe with calculated cost
    const { data: updatedRecipe } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', recipe.id)
      .single();

    return NextResponse.json({ 
      success: true, 
      recipe: updatedRecipe || recipe,
      laborRate, // Return for UI
    });
  });
}

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':recipes-list');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const category = searchParams.get('category');
    const includeVenues = searchParams.get('include_venues') === 'true';

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

    // Optionally include venues for venue selector in UI
    let venues = null;
    if (includeVenues && venueIds.length > 0) {
      const { data: venueData } = await supabase
        .from('venues')
        .select('id, name, labor_rate_per_hour')
        .in('id', venueIds)
        .eq('is_active', true)
        .order('name');
      venues = venueData;
    }

    return NextResponse.json({ recipes, venues });
  });
}
