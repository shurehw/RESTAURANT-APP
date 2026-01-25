import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

// GET - Fetch single recipe with components
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':recipes-get');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);
    
    const { id } = await params;
    const supabase = await createClient();

    // Fetch recipe with components
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single();

    if (recipeError) {
      if (recipeError.code === 'PGRST116') {
        throw { status: 404, code: 'NOT_FOUND', message: 'Recipe not found' };
      }
      throw recipeError;
    }

    // Fetch components with item/recipe names
    const { data: components, error: componentsError } = await supabase
      .from('recipe_items')
      .select(`
        id,
        item_id,
        sub_recipe_id,
        qty,
        uom,
        items:item_id (id, name, base_uom, sku),
        sub_recipe:sub_recipe_id (id, name, yield_uom, cost_per_unit)
      `)
      .eq('recipe_id', id);

    if (componentsError) throw componentsError;

    // Transform components to match UI format
    const transformedComponents = components?.map(c => {
      if (c.item_id && c.items) {
        const item = c.items as any;
        return {
          id: c.id,
          type: 'item' as const,
          itemId: c.item_id,
          name: item.name,
          qty: c.qty,
          uom: c.uom || item.base_uom,
          cost: 0, // Will need to fetch from item_cost_history
        };
      } else if (c.sub_recipe_id && c.sub_recipe) {
        const subRecipe = c.sub_recipe as any;
        return {
          id: c.id,
          type: 'sub_recipe' as const,
          subRecipeId: c.sub_recipe_id,
          name: subRecipe.name,
          qty: c.qty,
          uom: c.uom || subRecipe.yield_uom,
          cost: subRecipe.cost_per_unit || 0,
        };
      }
      return null;
    }).filter(Boolean) || [];

    // Fetch latest costs for items
    const itemIds = transformedComponents
      .filter(c => c?.type === 'item')
      .map(c => c?.itemId);

    if (itemIds.length > 0) {
      const { data: costs } = await supabase
        .from('item_cost_history')
        .select('item_id, unit_cost')
        .in('item_id', itemIds)
        .order('effective_date', { ascending: false });

      // Get latest cost per item
      const latestCosts = new Map<string, number>();
      costs?.forEach(c => {
        if (!latestCosts.has(c.item_id)) {
          latestCosts.set(c.item_id, c.unit_cost);
        }
      });

      // Update component costs
      transformedComponents.forEach(c => {
        if (c?.type === 'item' && c.itemId) {
          c.cost = latestCosts.get(c.itemId) || 0;
        }
      });
    }

    return NextResponse.json({
      recipe: {
        ...recipe,
        components: transformedComponents,
      },
    });
  });
}

// PATCH - Update recipe
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':recipes-update');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      recipe_type,
      item_category,
      category,
      yield_qty,
      yield_uom,
      labor_minutes,
      menu_price,
      pos_sku,
      food_cost_target,
      components,
    } = body;

    const supabase = await createClient();

    // Check recipe exists and user has access
    const { data: existingRecipe, error: fetchError } = await supabase
      .from('recipes')
      .select('id, venue_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingRecipe) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Recipe not found' };
    }

    if (!venueIds.includes(existingRecipe.venue_id)) {
      throw { status: 403, code: 'FORBIDDEN', message: 'You do not have access to this recipe' };
    }

    // Update recipe header
    const { data: recipe, error: updateError } = await supabase
      .from('recipes')
      .update({
        name: name?.trim(),
        recipe_type,
        item_category: item_category || 'food',
        category: category?.trim() || null,
        yield_qty,
        yield_uom: yield_uom?.trim(),
        labor_minutes: labor_minutes || 0,
        menu_price: menu_price || null,
        pos_sku: pos_sku?.trim() || null,
        food_cost_target: food_cost_target || 28,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // If components provided, replace them
    if (components && Array.isArray(components)) {
      // Delete existing components
      const { error: deleteError } = await supabase
        .from('recipe_items')
        .delete()
        .eq('recipe_id', id);

      if (deleteError) throw deleteError;

      // Insert new components
      if (components.length > 0) {
        const componentData = components.map((comp: any) => ({
          recipe_id: id,
          item_id: comp.type === 'item' ? comp.itemId : null,
          sub_recipe_id: comp.type === 'sub_recipe' ? comp.subRecipeId : null,
          qty: comp.qty,
          uom: comp.uom,
        }));

        const { error: insertError } = await supabase
          .from('recipe_items')
          .insert(componentData);

        if (insertError) throw insertError;
      }
    }

    // Recalculate cost
    const { data: costData } = await supabase
      .from('v_recipe_costs')
      .select('line_cost')
      .eq('recipe_id', id);

    const ingredientCost = costData?.reduce((sum, row) => sum + (row.line_cost || 0), 0) || 0;
    const laborCost = ((labor_minutes || 0) / 60) * 15; // TODO: Use venue labor rate
    const totalCost = ingredientCost + laborCost;
    const costPerUnit = (yield_qty || 1) > 0 ? totalCost / (yield_qty || 1) : 0;

    await supabase
      .from('recipes')
      .update({ cost_per_unit: costPerUnit })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      recipe: { ...recipe, cost_per_unit: costPerUnit },
    });
  });
}

// DELETE - Deactivate recipe (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':recipes-delete');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const { id } = await params;
    const supabase = await createClient();

    // Check recipe exists and user has access
    const { data: existingRecipe, error: fetchError } = await supabase
      .from('recipes')
      .select('id, venue_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingRecipe) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Recipe not found' };
    }

    if (!venueIds.includes(existingRecipe.venue_id)) {
      throw { status: 403, code: 'FORBIDDEN', message: 'You do not have access to this recipe' };
    }

    // Soft delete by setting is_active = false
    const { error: deleteError } = await supabase
      .from('recipes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  });
}
