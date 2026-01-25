'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, X, ArrowLeft, Save, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RecipeComponent {
  id: string;
  type: 'item' | 'sub_recipe';
  itemId?: string;
  subRecipeId?: string;
  name: string;
  qty: number;
  uom: string;
  cost?: number;
}

// Valid item_category values from DB enum
type ItemCategory = 'food' | 'beverage' | 'liquor' | 'wine' | 'beer' | 'spirits';

// Cost targets by category
const COST_TARGETS: Record<ItemCategory, number> = {
  food: 28,
  beverage: 20,
  liquor: 18,
  wine: 22,
  beer: 20,
  spirits: 18,
};

interface RecipeBuilderProps {
  recipeId?: string; // If provided, we're in edit mode
  initialData?: {
    name: string;
    recipe_type: 'prepared_item' | 'menu_item';
    item_category: ItemCategory;
    category: string;
    yield_qty: number;
    yield_uom: string;
    labor_minutes: number;
    menu_price: number | null;
    pos_sku: string | null;
    food_cost_target: number;
    components: RecipeComponent[];
  };
  laborRatePerHour?: number; // From venue/org settings
}

export function RecipeBuilder({ recipeId, initialData, laborRatePerHour = 15 }: RecipeBuilderProps) {
  const router = useRouter();
  const isEditMode = !!recipeId;
  
  const [name, setName] = useState(initialData?.name || '');
  const [recipeType, setRecipeType] = useState<'prepared_item' | 'menu_item'>(initialData?.recipe_type || 'prepared_item');
  const [itemCategory, setItemCategory] = useState<ItemCategory>(initialData?.item_category || 'food');
  const [category, setCategory] = useState(initialData?.category || '');
  const [yieldQty, setYieldQty] = useState(initialData?.yield_qty || 1);
  const [yieldUom, setYieldUom] = useState(initialData?.yield_uom || 'portion');
  const [laborMinutes, setLaborMinutes] = useState(initialData?.labor_minutes || 0);
  const [menuPrice, setMenuPrice] = useState<number>(initialData?.menu_price || 0);
  const [posSku, setPosSku] = useState(initialData?.pos_sku || '');
  const [components, setComponents] = useState<RecipeComponent[]>(initialData?.components || []);
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Component search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ items: any[]; recipes: any[] }>({ items: [], recipes: [] });
  const [searching, setSearching] = useState(false);

  // Dynamic target food cost % based on category
  const targetFoodCostPct = COST_TARGETS[itemCategory] || 28;

  const totalCost = components.reduce((sum, c) => sum + (c.cost || 0) * c.qty, 0);
  const laborCost = (laborMinutes / 60) * laborRatePerHour;
  const totalRecipeCost = totalCost + laborCost;
  const costPerUnit = yieldQty > 0 ? totalRecipeCost / yieldQty : 0;
  const foodCostPct = menuPrice > 0 ? (costPerUnit / menuPrice) * 100 : 0;

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults({ items: [], recipes: [] });
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/items/search?q=${encodeURIComponent(query)}&include_recipes=true`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddItem = (item: any) => {
    const newComponent: RecipeComponent = {
      id: Math.random().toString(),
      type: 'item',
      itemId: item.id,
      name: item.name,
      qty: 1,
      uom: item.base_uom || 'ea',
      cost: item.unit_cost || 0,
    };
    setComponents([...components, newComponent]);
    setShowAddComponent(false);
    setSearchQuery('');
    setSearchResults({ items: [], recipes: [] });
  };

  const handleAddRecipe = (recipe: any) => {
    const newComponent: RecipeComponent = {
      id: Math.random().toString(),
      type: 'sub_recipe',
      subRecipeId: recipe.id,
      name: recipe.name,
      qty: 1,
      uom: recipe.yield_uom || 'portion',
      cost: recipe.cost_per_unit || 0,
    };
    setComponents([...components, newComponent]);
    setShowAddComponent(false);
    setSearchQuery('');
    setSearchResults({ items: [], recipes: [] });
  };

  const handleAddComponent = (component: RecipeComponent) => {
    setComponents([...components, { ...component, id: Math.random().toString() }]);
    setShowAddComponent(false);
  };

  const handleRemoveComponent = (id: string) => {
    setComponents(components.filter(c => c.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const url = isEditMode ? `/api/recipes/${recipeId}` : '/api/recipes';
      const method = isEditMode ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          recipe_type: recipeType,
          item_category: itemCategory,
          category,
          yield_qty: yieldQty,
          yield_uom: yieldUom,
          labor_minutes: laborMinutes,
          menu_price: recipeType === 'menu_item' ? menuPrice : null,
          pos_sku: recipeType === 'menu_item' ? posSku : null,
          food_cost_target: targetFoodCostPct,
          components: components.map(c => ({
            type: c.type,
            itemId: c.itemId,
            subRecipeId: c.subRecipeId,
            qty: c.qty,
            uom: c.uom,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save recipe');
      }

      // Success! Redirect to recipe list
      router.push('/recipes');
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <a href="/recipes">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Recipes
          </a>
        </Button>

        <h1 className="page-header">{isEditMode ? 'Edit Recipe' : 'New Recipe'}</h1>
        <p className="text-muted-foreground">
          {isEditMode ? 'Update recipe ingredients and details' : 'Build a recipe with ingredients and sub-recipes'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Recipe Details & Components (2/3) */}
        <div className="col-span-2 space-y-6">
          {/* Recipe Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Recipe Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Recipe Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Béarnaise Sauce"
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <select
                  value={recipeType}
                  onChange={(e) => setRecipeType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
                >
                  <option value="prepared_item">Prepared Item (Sub-Recipe)</option>
                  <option value="menu_item">Menu Item (Final Dish)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Primary Category</label>
                <select
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value as ItemCategory)}
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
                >
                  <option value="food">Food (Target: 28%)</option>
                  <option value="beverage">Non-Alcoholic Beverage (Target: 20%)</option>
                  <option value="liquor">Liquor/Cocktails (Target: 18%)</option>
                  <option value="wine">Wine (Target: 22%)</option>
                  <option value="beer">Beer (Target: 20%)</option>
                  <option value="spirits">Spirits (Target: 18%)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Subcategory</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Appetizer, Entree, Cocktail, Beer"
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Yield Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  value={yieldQty}
                  onChange={(e) => setYieldQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Yield Unit</label>
                <input
                  type="text"
                  value={yieldUom}
                  onChange={(e) => setYieldUom(e.target.value)}
                  placeholder="e.g., portion, oz, cup"
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Prep Time (minutes)</label>
                <input
                  type="number"
                  value={laborMinutes}
                  onChange={(e) => setLaborMinutes(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>

              {recipeType === 'menu_item' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Menu Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={menuPrice}
                      onChange={(e) => setMenuPrice(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">POS SKU/PLU</label>
                    <input
                      type="text"
                      value={posSku}
                      onChange={(e) => setPosSku(e.target.value)}
                      placeholder="e.g., 1234 or STEAK-8OZ"
                      className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Recipe Components */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Recipe Components</h3>
              <Button
                size="sm"
                variant="brass"
                onClick={() => setShowAddComponent(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Component
              </Button>
            </div>

            {components.length > 0 ? (
              <div className="space-y-2">
                {components.map((component) => (
                  <div
                    key={component.id}
                    className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant={component.type === 'sub_recipe' ? 'brass' : 'sage'}>
                        {component.type === 'sub_recipe' ? 'Sub-Recipe' : 'Ingredient'}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{component.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {component.qty} {component.uom}
                          {component.cost && ` • $${(component.cost * component.qty).toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveComponent(component.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                No components added yet
                <br />
                <span className="text-xs">Add ingredients or sub-recipes to build your recipe</span>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Cost Summary (1/3) */}
        <div className="col-span-1">
          <Card className="p-6 sticky top-8">
            <h3 className="font-semibold mb-4">Cost Summary</h3>

            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ingredient Cost</span>
                <span className="font-mono">${totalCost.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Labor Cost</span>
                <span className="font-mono">${laborCost.toFixed(2)}</span>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between mb-2">
                  <span className="font-semibold">Total Recipe Cost</span>
                  <span className="font-mono font-bold text-lg">${totalRecipeCost.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Cost per {yieldUom}</span>
                  <span className="font-mono text-brass font-semibold">${costPerUnit.toFixed(2)}</span>
                </div>

                {recipeType === 'menu_item' && menuPrice > 0 && (
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Menu Price</span>
                    <span className="font-mono">${menuPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {recipeType === 'menu_item' && menuPrice > 0 && (
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">
                      {itemCategory === 'food' ? 'Food Cost %' : 'Pour Cost %'}
                    </span>
                    <span className={`font-mono font-bold text-xl ${
                      foodCostPct <= targetFoodCostPct ? 'text-opsos-sage-600' :
                      foodCostPct <= targetFoodCostPct + 7 ? 'text-brass' :
                      'text-opsos-error'
                    }`}>
                      {foodCostPct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {foodCostPct <= targetFoodCostPct && '✓ At or below target'}
                    {foodCostPct > targetFoodCostPct && foodCostPct <= targetFoodCostPct + 7 && `Target: ${targetFoodCostPct}%`}
                    {foodCostPct > targetFoodCostPct + 7 && `⚠ Above target (${targetFoodCostPct}%)`}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t space-y-2">
                {error && (
                  <div className="p-3 bg-opsos-error-50 border border-opsos-error-200 rounded-md text-sm text-opsos-error-700">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  variant="brass"
                  onClick={handleSave}
                  disabled={!name || components.length === 0 || saving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : isEditMode ? 'Update Recipe' : 'Save Recipe'}
                </Button>

                <Button
                  className="w-full"
                  variant="outline"
                  asChild
                  disabled={saving}
                >
                  <a href="/recipes">Cancel</a>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Add Component Modal */}
      {showAddComponent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Add Component</h3>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowAddComponent(false);
                setSearchQuery('');
                setSearchResults({ items: [], recipes: [] });
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search for ingredients or sub-recipes..."
                className="w-full pl-10 pr-4 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                autoFocus
              />
            </div>

            {/* Loading State */}
            {searching && (
              <div className="text-center py-8 text-muted-foreground">
                Searching...
              </div>
            )}

            {/* Search Results */}
            {!searching && searchQuery.length >= 2 && (
              <div className="space-y-4">
                {/* Items Section */}
                {searchResults.items && searchResults.items.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Ingredients</h4>
                    <div className="space-y-1">
                      {searchResults.items.map((item: any) => (
                        <button
                          key={item.id}
                          onClick={() => handleAddItem(item)}
                          className="w-full p-3 border rounded-md hover:bg-muted/50 text-left transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{item.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.sku && `${item.sku} • `}
                                {item.category && `${item.category} • `}
                                {item.base_uom}
                              </div>
                            </div>
                            <div className="text-sm font-mono text-muted-foreground">
                              ${(item.unit_cost || 0).toFixed(2)}/{item.base_uom}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recipes Section */}
                {searchResults.recipes && searchResults.recipes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Sub-Recipes</h4>
                    <div className="space-y-1">
                      {searchResults.recipes.map((recipe: any) => (
                        <button
                          key={recipe.id}
                          onClick={() => handleAddRecipe(recipe)}
                          className="w-full p-3 border border-brass/30 rounded-md hover:bg-brass/5 text-left transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm flex items-center gap-2">
                                {recipe.name}
                                <Badge variant="brass" className="text-xs">Sub-Recipe</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {recipe.category && `${recipe.category} • `}
                                {recipe.recipe_type === 'menu_item' ? 'Menu Item' : 'Prepared Item'} • {recipe.yield_uom}
                              </div>
                            </div>
                            <div className="text-sm font-mono text-muted-foreground">
                              ${(recipe.cost_per_unit || 0).toFixed(2)}/{recipe.yield_uom}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {(!searchResults.items || searchResults.items.length === 0) &&
                 (!searchResults.recipes || searchResults.recipes.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No results found for "{searchQuery}"
                    <br />
                    <span className="text-xs">Try a different search term</span>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!searching && searchQuery.length < 2 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                Start typing to search for ingredients or sub-recipes
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
