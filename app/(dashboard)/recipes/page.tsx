/**
 * Recipe Management Page
 * List all recipes with search and filter
 */

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, ChefHat } from "lucide-react";

export default async function RecipesPage() {
  const supabase = await createClient();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("*")
    .order("name", { ascending: true })
    .limit(50);

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Recipes</h1>
          <p className="text-muted-foreground">
            Manage recipes, sub-recipes, and menu items
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline">
            <Search className="w-4 h-4" />
            Search
          </Button>
          <Button variant="brass" asChild>
            <a href="/recipes/new">
              <Plus className="w-4 h-4" />
              New Recipe
            </a>
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button className="px-4 py-2 font-medium border-b-2 border-brass text-brass">
          All Recipes ({recipes?.length || 0})
        </button>
        <button className="px-4 py-2 font-medium text-muted-foreground hover:text-foreground">
          Prepared Items
        </button>
        <button className="px-4 py-2 font-medium text-muted-foreground hover:text-foreground">
          Menu Items
        </button>
      </div>

      {/* Recipes Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipe Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Yield</TableHead>
              <TableHead className="text-right">Cost/Unit</TableHead>
              <TableHead className="text-right">Labor (min)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipes?.map((recipe) => (
              <TableRow key={recipe.id}>
                <TableCell className="font-medium">{recipe.name}</TableCell>
                <TableCell>
                  <Badge variant="sage" className="text-xs">
                    {recipe.recipe_type || 'prepared_item'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {recipe.category || '—'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {recipe.yield_qty} {recipe.yield_uom}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${recipe.cost_per_unit?.toFixed(2) || '—'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {recipe.labor_minutes || 0}
                </TableCell>
                <TableCell>
                  <Badge variant={recipe.is_active ? 'sage' : 'default'}>
                    {recipe.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/recipes/${recipe.id}`}>Edit</a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {(!recipes || recipes.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ChefHat className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No recipes found</h3>
          <p className="empty-state-description">
            Create your first recipe to get started
          </p>
          <Button variant="brass" asChild>
            <a href="/recipes/new">
              <Plus className="w-4 h-4" />
              New Recipe
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
