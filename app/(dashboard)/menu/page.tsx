export const dynamic = 'force-dynamic';

/**
 * Menu Hub
 * Tabs: Recipes, Menu Items (mapping)
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { HubTabBar } from '@/components/ui/HubTabBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Search, ChefHat } from 'lucide-react';

const TABS = [
  { key: 'recipes', label: 'Recipes' },
  { key: 'menu-items', label: 'Menu Items' },
];

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab || 'recipes';

  const ctx = await resolveContext();
  if (!ctx?.isAuthenticated || !ctx.authUserId) {
    return <div className="p-8">Not authenticated. Please log in.</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-header">Menu</h1>
        <p className="text-muted-foreground">
          Recipes, menu items, and POS mapping
        </p>
      </div>

      <HubTabBar tabs={TABS} basePath="/menu" defaultTab="recipes" />

      <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading...</div>}>
        {tab === 'recipes' && <RecipesTab />}
        {tab === 'menu-items' && <MenuItemsTab />}
      </Suspense>
    </div>
  );
}

async function RecipesTab() {
  const supabase = await createClient();

  const { data: recipes } = await supabase
    .from('recipes')
    .select('*')
    .order('name', { ascending: true })
    .limit(50);

  return (
    <>
      <div className="flex justify-end gap-3 mb-4">
        <Button variant="outline"><Search className="w-4 h-4" /> Search</Button>
        <Button variant="brass" asChild>
          <a href="/recipes/new"><Plus className="w-4 h-4" /> New Recipe</a>
        </Button>
      </div>

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
                <TableCell className="text-muted-foreground">{recipe.category || '—'}</TableCell>
                <TableCell className="text-right font-mono">
                  {recipe.yield_qty} {recipe.yield_uom}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${recipe.cost_per_unit?.toFixed(2) || '—'}
                </TableCell>
                <TableCell className="text-right font-mono">{recipe.labor_minutes || 0}</TableCell>
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
            {(!recipes || recipes.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <ChefHat className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No recipes found</p>
                  <p className="text-sm mt-1">Create your first recipe to get started</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

async function MenuItemsTab() {
  const supabase = await createClient();

  // Get mapping coverage
  const { data: coverageRows } = await supabase
    .from('v_menu_item_mapping_coverage')
    .select('*');

  const totalItems = coverageRows?.reduce((sum, r) => sum + (r.total_items || 0), 0) || 0;
  const unmappedItems = coverageRows?.reduce((sum, r) => sum + (r.unmapped_items || 0), 0) || 0;
  const mappedItems = totalItems - unmappedItems;
  const totalCoveredSales = coverageRows?.reduce((sum, r) => sum + (r.mapped_sales || 0), 0) || 0;
  const totalSales = coverageRows?.reduce((sum, r) => sum + (r.total_sales || 0), 0) || 0;
  const salesCoveragePct = totalSales > 0 ? Math.round((totalCoveredSales / totalSales) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Coverage summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Menu Items</div>
          <div className="text-2xl font-bold mt-1">{totalItems}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Mapped to Recipes</div>
          <div className="text-2xl font-bold mt-1 text-keva-sage-600">{mappedItems}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Sales Coverage</div>
          <div className={`text-2xl font-bold mt-1 ${salesCoveragePct >= 90 ? 'text-keva-sage-600' : 'text-brass'}`}>
            {salesCoveragePct}%
          </div>
        </div>
      </div>

      {unmappedItems > 0 && (
        <div className="bg-keva-error-50 border border-keva-error-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-keva-error-800">
                {unmappedItems} menu items need mapping
              </h4>
              <p className="text-sm text-keva-error-700 mt-1">
                Map POS menu items to recipes for accurate theoretical COGS.
              </p>
            </div>
            <Button variant="brass" asChild>
              <a href="/reports/variance/map-items">Map Items</a>
            </Button>
          </div>
        </div>
      )}

      {unmappedItems === 0 && totalItems > 0 && (
        <div className="bg-keva-sage-50 border border-keva-sage-200 rounded-lg p-4">
          <h4 className="font-semibold text-keva-sage-800">All menu items mapped</h4>
          <p className="text-sm text-keva-sage-700 mt-1">
            100% coverage. Theoretical COGS is fully computed.
          </p>
        </div>
      )}

      <Button variant="outline" asChild>
        <a href="/reports/variance/map-items">Open Full Mapping Tool</a>
      </Button>
    </div>
  );
}
