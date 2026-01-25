'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RecipeBuilder } from '@/components/recipes/RecipeBuilder';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

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
  const recipeId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);

  useEffect(() => {
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

  return (
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
  );
}
