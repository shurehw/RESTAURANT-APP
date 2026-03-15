'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RecipeBuilder } from '@/components/recipes/RecipeBuilder';
import { RecipeChat, type ExistingRecipeContext } from '@/components/recipes/RecipeChat';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Wrench } from 'lucide-react';

interface RecipeData {
  id: string;
  name: string;
  recipe_type: 'prepared_item' | 'menu_item';
  item_category: 'food' | 'beverage' | 'liquor' | 'wine' | 'beer' | 'spirits';
  category: string;
  yield_qty: number;
  yield_uom: string;
  labor_minutes: number;
  menu_price: number | null;
  pos_sku: string | null;
  food_cost_target: number;
  cost_per_unit: number;
  components: any[];
}

export default function EditRecipePage() {
  const params = useParams();
  const router = useRouter();
  const recipeId = typeof params?.id === 'string' ? params.id : '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [mode, setMode] = useState<'builder' | 'rethink'>('builder');

  useEffect(() => {
    if (!recipeId) {
      setError('Recipe ID is missing');
      setLoading(false);
      return;
    }

    async function fetchRecipe() {
      try {
        const response = await fetch(`/api/recipes/${recipeId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Failed to load recipe');
        }

        setRecipe(data.recipe);
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load recipe');
      } finally {
        setLoading(false);
      }
    }

    fetchRecipe();
  }, [recipeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brass" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card className="p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Error Loading Recipe</h2>
          <p className="text-muted-foreground mb-4">{error || 'Recipe not found'}</p>
          <button
            onClick={() => router.push('/recipes')}
            className="text-brass hover:underline"
          >
            Back to Recipes
          </button>
        </Card>
      </div>
    );
  }

  // Build context for rethink mode
  const existingRecipeContext: ExistingRecipeContext = {
    id: recipeId,
    name: recipe.name,
    recipe_type: recipe.recipe_type,
    item_category: recipe.item_category,
    category: recipe.category || '',
    yield_qty: recipe.yield_qty,
    yield_uom: recipe.yield_uom,
    labor_minutes: recipe.labor_minutes || 0,
    menu_price: recipe.menu_price,
    food_cost_target: recipe.food_cost_target || 28,
    cost_per_unit: recipe.cost_per_unit,
    components: (recipe.components || []).map((c: any) => ({
      type: c.type,
      name: c.name,
      qty: c.qty,
      uom: c.uom,
      cost: c.cost || 0,
      itemId: c.itemId,
      subRecipeId: c.subRecipeId,
    })),
  };

  if (mode === 'rethink') {
    return <RecipeChat existingRecipe={existingRecipeContext} />;
  }

  return (
    <>
      {/* Mode toggle */}
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMode('rethink')}
          className="gap-1.5"
        >
          <MessageSquare className="w-4 h-4" />
          Rethink with AI
        </Button>
      </div>

      <RecipeBuilder
        recipeId={recipeId}
        initialData={{
          name: recipe.name,
          recipe_type: recipe.recipe_type,
          item_category: recipe.item_category,
          category: recipe.category || '',
          yield_qty: recipe.yield_qty,
          yield_uom: recipe.yield_uom,
          labor_minutes: recipe.labor_minutes || 0,
          menu_price: recipe.menu_price,
          pos_sku: recipe.pos_sku,
          food_cost_target: recipe.food_cost_target || 28,
          components: recipe.components || [],
        }}
      />
    </>
  );
}
