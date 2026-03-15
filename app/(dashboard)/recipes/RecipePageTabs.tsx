'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Search, ChefHat, MessageSquare } from 'lucide-react';
import { RecipeChat } from '@/components/recipes/RecipeChat';

interface Recipe {
  id: string;
  name: string;
  recipe_type: string | null;
  category: string | null;
  yield_qty: number;
  yield_uom: string;
  cost_per_unit: number | null;
  labor_minutes: number | null;
  is_active: boolean;
}

export function RecipePageTabs({ recipes }: { recipes: Recipe[] }) {
  const [tab, setTab] = useState<'list' | 'chat'>('list');

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
          {tab === 'list' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'list'
              ? 'border-brass text-brass'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ChefHat className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          All Recipes ({recipes.length})
        </button>
        <button
          onClick={() => setTab('chat')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'chat'
              ? 'border-brass text-brass'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          AI Recipe Builder
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'list' ? (
        <>
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
                {recipes.map((recipe) => (
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
          {recipes.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ChefHat className="w-8 h-8" />
              </div>
              <h3 className="empty-state-title">No recipes found</h3>
              <p className="empty-state-description">
                Create your first recipe or use the AI Recipe Builder
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="brass" asChild>
                  <a href="/recipes/new">
                    <Plus className="w-4 h-4" />
                    New Recipe
                  </a>
                </Button>
                <Button variant="outline" onClick={() => setTab('chat')}>
                  <MessageSquare className="w-4 h-4" />
                  AI Recipe Builder
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <RecipeChat />
      )}
    </div>
  );
}
