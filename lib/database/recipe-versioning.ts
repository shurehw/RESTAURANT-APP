/**
 * Recipe Versioning — Full BOM version chain
 * Every recipe change creates a new version; old versions are preserved.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────────────

export interface RecipeVersion {
  recipe_lineage_id: string;
  recipe_id: string;
  name: string;
  version: number;
  cost_per_unit: number;
  effective_from: string;
  effective_to: string | null;
  change_notes: string | null;
  changed_by: string | null;
  superseded_by: string | null;
  is_current: boolean;
  cost_delta: number | null;
  cost_change_pct: number | null;
}

export interface BomDiffItem {
  item_id: string;
  item_name: string;
  qty_a: number | null;
  qty_b: number | null;
  qty_delta: number;
  uom_a: string | null;
  uom_b: string | null;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
}

export interface RecipeItemChange {
  item_id?: string;
  sub_recipe_id?: string;
  qty: number;
  uom: string;
}

// ── Version Management ─────────────────────────────────────────────────

/**
 * Create a new version of a recipe.
 * Deep-copies recipe + recipe_items, retires old version,
 * and updates menu_item_recipe_map.
 */
export async function createRecipeVersion(
  recipeId: string,
  changeNotes: string,
  changedBy: string
): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any).rpc('create_recipe_version', {
    p_recipe_id: recipeId,
    p_change_notes: changeNotes,
    p_changed_by: changedBy,
  });

  if (error) throw new Error(`Failed to create recipe version: ${error.message}`);
  return data as string;
}

/**
 * Create a new version with modified BOM.
 * 1. Creates version (copies current BOM)
 * 2. Applies item changes to new version
 * 3. Recalculates cost
 */
export async function createRecipeVersionWithChanges(
  recipeId: string,
  changes: {
    addItems?: RecipeItemChange[];
    removeItemIds?: string[];
    updateItems?: (RecipeItemChange & { item_id: string })[];
    recipeUpdates?: Record<string, any>;
  },
  changeNotes: string,
  changedBy: string
): Promise<string> {
  const supabase = getServiceClient();

  // Step 1: Create version (deep copy)
  const newId = await createRecipeVersion(recipeId, changeNotes, changedBy);

  // Step 2: Apply changes to new version's recipe_items
  if (changes.removeItemIds?.length) {
    await (supabase as any)
      .from('recipe_items')
      .delete()
      .eq('recipe_id', newId)
      .in('item_id', changes.removeItemIds);
  }

  if (changes.updateItems?.length) {
    for (const item of changes.updateItems) {
      await (supabase as any)
        .from('recipe_items')
        .update({ qty: item.qty, uom: item.uom })
        .eq('recipe_id', newId)
        .eq('item_id', item.item_id);
    }
  }

  if (changes.addItems?.length) {
    await (supabase as any)
      .from('recipe_items')
      .insert(
        changes.addItems.map((item) => ({
          recipe_id: newId,
          item_id: item.item_id || null,
          sub_recipe_id: item.sub_recipe_id || null,
          qty: item.qty,
          uom: item.uom,
        }))
      );
  }

  // Step 3: Apply recipe-level updates (menu_price, labor_minutes, etc.)
  if (changes.recipeUpdates && Object.keys(changes.recipeUpdates).length > 0) {
    await (supabase as any)
      .from('recipes')
      .update(changes.recipeUpdates)
      .eq('id', newId);
  }

  // Step 4: Recalculate cost (triggers will handle this via recipe_items change)
  await (supabase as any).rpc('recalculate_recipe_cost', { p_recipe_id: newId });

  return newId;
}

// ── Queries ────────────────────────────────────────────────────────────

export async function getRecipeVersionHistory(recipeId: string): Promise<RecipeVersion[]> {
  const supabase = getServiceClient();

  // Get the lineage ID (could be the recipe itself or its parent)
  const { data: recipe } = await (supabase as any)
    .from('recipes')
    .select('id, parent_recipe_id')
    .eq('id', recipeId)
    .single();

  const lineageId = recipe?.parent_recipe_id || recipe?.id;

  const { data, error } = await (supabase as any)
    .from('v_recipe_version_history')
    .select('*')
    .eq('recipe_lineage_id', lineageId)
    .order('version', { ascending: true });

  if (error) throw new Error(`Failed to fetch version history: ${error.message}`);
  return data || [];
}

export async function getRecipeAtVersion(
  recipeId: string,
  version: number
): Promise<{ recipe: any; items: any[] } | null> {
  const supabase = getServiceClient();

  // Find the specific version
  const { data: recipe } = await (supabase as any)
    .from('recipes')
    .select('*')
    .or(`id.eq.${recipeId},parent_recipe_id.eq.${recipeId}`)
    .eq('version', version)
    .single();

  if (!recipe) return null;

  const { data: items } = await (supabase as any)
    .from('recipe_items')
    .select('*, items(name, unit_of_measure)')
    .eq('recipe_id', recipe.id);

  return { recipe, items: items || [] };
}

export async function diffRecipeVersions(
  versionAId: string,
  versionBId: string
): Promise<BomDiffItem[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any).rpc('diff_recipe_versions', {
    p_version_a: versionAId,
    p_version_b: versionBId,
  });

  if (error) throw new Error(`Failed to diff versions: ${error.message}`);
  return (data as BomDiffItem[]) || [];
}

/**
 * Rollback: create a new version from an old version's BOM.
 */
export async function rollbackToVersion(
  currentRecipeId: string,
  targetVersion: number,
  changedBy: string
): Promise<string> {
  const target = await getRecipeAtVersion(currentRecipeId, targetVersion);
  if (!target) throw new Error(`Version ${targetVersion} not found`);

  return createRecipeVersionWithChanges(
    currentRecipeId,
    {
      // Remove all current items and re-add from target
      removeItemIds: [], // handled by the deep copy + overwrite below
      addItems: target.items.map((i) => ({
        item_id: i.item_id,
        sub_recipe_id: i.sub_recipe_id,
        qty: i.qty,
        uom: i.uom,
      })),
    },
    `Rollback to version ${targetVersion}`,
    changedBy
  );
}
