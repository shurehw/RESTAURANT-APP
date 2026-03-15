import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  inferCategory,
  inferSubcategory,
  inferItemType,
} from '@/lib/items/inference';

/**
 * POST /api/items/from-recipe
 * Bulk-create catalog items from AI-generated recipe ingredients.
 * Lightweight: only requires name + uom. Auto-infers category, GL, etc.
 * Returns created items with their IDs so the recipe can link to them.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':items-from-recipe');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const { ingredients } = body as {
      ingredients: Array<{
        name: string;
        uom: string;
        category_hint?: string;
        estimated_cost?: number | null;
      }>;
    };

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw { status: 400, code: 'NO_INGREDIENTS', message: 'No ingredients provided' };
    }

    if (ingredients.length > 50) {
      throw { status: 400, code: 'TOO_MANY', message: 'Maximum 50 items per request' };
    }

    const adminClient = createAdminClient();

    // Check for existing items by name to avoid duplicates
    const names = ingredients.map(i => i.name.trim().toLowerCase());
    const { data: existingItems } = await adminClient
      .from('items')
      .select('id, name, base_uom')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    const existingByName = new Map(
      (existingItems || []).map(item => [item.name.toLowerCase(), item])
    );

    const created: Array<{ name: string; id: string; uom: string; existed: boolean }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const ing of ingredients) {
      const trimmedName = ing.name.trim();
      const lowerName = trimmedName.toLowerCase();

      // Skip if already in catalog
      const existing = existingByName.get(lowerName);
      if (existing) {
        created.push({
          name: existing.name,
          id: existing.id,
          uom: existing.base_uom,
          existed: true,
        });
        continue;
      }

      // Infer category from name or AI hint
      const category = ing.category_hint
        ? inferCategory(ing.category_hint)
        : inferCategory(trimmedName);
      const subcategory = inferSubcategory(trimmedName, category);
      const itemType = inferItemType(category);

      // Generate a SKU from the name
      const sku = trimmedName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30);

      const { data: item, error } = await adminClient
        .from('items')
        .insert({
          name: trimmedName,
          sku,
          category,
          subcategory,
          base_uom: ing.uom || 'unit',
          organization_id: orgId,
          is_active: true,
          item_type: itemType,
        })
        .select('id, name, base_uom')
        .single();

      if (error) {
        errors.push({ name: trimmedName, error: error.message });
      } else {
        created.push({
          name: item.name,
          id: item.id,
          uom: item.base_uom,
          existed: false,
        });

        // If AI provided an estimated cost, seed cost history
        if (ing.estimated_cost && ing.estimated_cost > 0) {
          await adminClient.from('item_cost_history').insert({
            item_id: item.id,
            unit_cost: ing.estimated_cost,
            effective_date: new Date().toISOString().slice(0, 10),
            source: 'manual',
          }).then(() => {}); // fire and forget
        }
      }
    }

    return NextResponse.json({
      created,
      errors,
      summary: {
        total: ingredients.length,
        new_items: created.filter(c => !c.existed).length,
        existing_matches: created.filter(c => c.existed).length,
        failed: errors.length,
      },
    });
  });
}
