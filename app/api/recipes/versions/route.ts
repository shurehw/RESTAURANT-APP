import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  createRecipeVersionWithChanges,
  getRecipeVersionHistory,
  diffRecipeVersions,
} from '@/lib/database/recipe-versioning';

/**
 * GET /api/recipes/versions?recipe_id=...
 * Get version history for a recipe.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const scoped = await createClient();
    const { searchParams } = new URL(req.url);
    const recipeId = searchParams.get('recipe_id');
    const diffA = searchParams.get('diff_a');
    const diffB = searchParams.get('diff_b');

    if (diffA && diffB) {
      await assertRecipeAccess(scoped, diffA, venueIds);
      await assertRecipeAccess(scoped, diffB, venueIds);
      const diff = await diffRecipeVersions(diffA, diffB);
      return NextResponse.json({ diff });
    }

    if (!recipeId) {
      return NextResponse.json({ error: 'recipe_id required' }, { status: 400 });
    }
    await assertRecipeAccess(scoped, recipeId, venueIds);

    const history = await getRecipeVersionHistory(recipeId);
    return NextResponse.json({ versions: history });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/recipes/versions
 * Create a new version of a recipe with changes.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const scoped = await createClient();
    const body = await req.json();
    await assertRecipeAccess(scoped, body.recipe_id, venueIds);

    const newId = await createRecipeVersionWithChanges(
      body.recipe_id,
      {
        addItems: body.add_items,
        removeItemIds: body.remove_item_ids,
        updateItems: body.update_items,
        recipeUpdates: body.recipe_updates,
      },
      body.change_notes || 'Recipe updated',
      user.id
    );

    return NextResponse.json({ recipe_id: newId }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function assertRecipeAccess(
  scoped: Awaited<ReturnType<typeof createClient>>,
  recipeId: string,
  venueIds: string[],
) {
  const { data: recipe } = await scoped
    .from('recipes')
    .select('venue_id')
    .eq('id', recipeId)
    .single();
  if (!recipe) {
    throw new Error('recipe not found');
  }
  // Global recipes (venue_id null) remain accessible to authenticated users.
  if (recipe.venue_id) {
    assertVenueAccess(recipe.venue_id, venueIds);
  }
}
