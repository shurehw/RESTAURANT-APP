'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChefHat, Send, Loader2, ArrowLeft, Save, RotateCcw,
  Plus, PackageOpen, ChevronDown, ChevronUp, AlertTriangle,
  DollarSign, Scale, Flame, Clock, Utensils, Camera, X, Image as ImageIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Ingredient {
  name: string;
  qty: number;
  uom: string;
  estimated_cost: number | null;
  catalog_item_id: string | null;
  catalog_item_name: string | null;
  is_sub_recipe: boolean;
}

interface Recipe {
  name: string;
  recipe_type: 'prepared_item' | 'menu_item';
  item_category: string;
  category: string;
  cooking_method: string;
  prep_style: string;
  yield_qty: number;
  yield_uom: string;
  labor_minutes: number;
  menu_price: number | null;
  suggested_menu_price: number | null;
  food_cost_target: number;
  allergens: string[];
  ingredients: Ingredient[];
  prep_ahead: string[];
  a_la_minute: string[];
  method: string[];
  chef_notes: string;
  cost_optimization: string | null;
  portion_weight: string | null;
  plating_notes: string | null;
  shelf_life: string | null;
  storage_notes: string | null;
  total_cost: number;
  cost_per_unit: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Meta {
  catalog_matched: number;
  new_items: number;
  total_ingredients: number;
  assistant_message: string;
}

const SCALE_OPTIONS = [0.5, 1, 1.5, 2, 3, 4];

const EXAMPLE_PROMPTS = [
  'Seared duck breast with cherry gastrique, 6 portions, under $11 cost',
  'Classic béarnaise sauce, 1 quart batch',
  'Lobster bisque for 20 covers, use existing stock',
  'Spicy tuna tartare appetizer, menu price $24',
  'Chocolate lava cake, 12 portions, dairy-free',
  'Old Fashioned cocktail spec, large format for 2',
  'Drop a photo of a dish — AI reverse-engineers the recipe',
];

const QUICK_TWEAKS = [
  { label: 'Make it cheaper', prompt: 'Reduce cost — suggest cheaper ingredient swaps to hit the food cost target without compromising quality' },
  { label: 'Gluten-free', prompt: 'Make this recipe gluten-free, substituting any wheat/gluten ingredients' },
  { label: 'Dairy-free', prompt: 'Make this recipe dairy-free, substituting any dairy ingredients' },
  { label: 'Vegan', prompt: 'Make this recipe fully vegan, no animal products' },
  { label: 'Simpler prep', prompt: 'Simplify the prep — fewer components, less labor time, easier for a busy line' },
  { label: 'More refined', prompt: 'Elevate this — add a fine-dining component or technique without blowing out cost' },
  { label: 'Larger batch', prompt: 'Scale this to a large batch prep (4x) for banquet or family meal service' },
  { label: 'Seasonal swap', prompt: 'Swap any out-of-season ingredients for what\'s best right now' },
];

// Allergen color coding
const ALLERGEN_COLORS: Record<string, string> = {
  dairy: 'bg-blue-100 text-blue-800',
  eggs: 'bg-yellow-100 text-yellow-800',
  gluten: 'bg-amber-100 text-amber-800',
  'tree nuts': 'bg-orange-100 text-orange-800',
  peanuts: 'bg-orange-100 text-orange-800',
  soy: 'bg-green-100 text-green-800',
  shellfish: 'bg-red-100 text-red-800',
  fish: 'bg-cyan-100 text-cyan-800',
  sesame: 'bg-lime-100 text-lime-800',
};

/** Existing recipe data for "rethink" mode */
export interface ExistingRecipeContext {
  id: string;
  name: string;
  recipe_type: string;
  item_category: string;
  category: string;
  yield_qty: number;
  yield_uom: string;
  labor_minutes: number;
  menu_price: number | null;
  food_cost_target: number;
  cost_per_unit: number | null;
  components: Array<{
    type: 'item' | 'sub_recipe';
    name: string;
    qty: number;
    uom: string;
    cost: number;
    itemId?: string;
    subRecipeId?: string;
  }>;
}

interface RecipeChatProps {
  existingRecipe?: ExistingRecipeContext;
}

interface UploadedImage {
  data: string; // base64 (no prefix)
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  preview: string; // data URL for display
  name: string;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function RecipeChat({ existingRecipe }: RecipeChatProps = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recipeRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showPrepBreakdown, setShowPrepBreakdown] = useState(true);
  const [tweakPrompt, setTweakPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // When seeded with an existing recipe, auto-focus the tweak input
  const isRethinkMode = !!existingRecipe;

  const processFile = (file: File): Promise<UploadedImage> => {
    return new Promise((resolve, reject) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        reject(new Error(`Unsupported file type: ${file.type}. Use JPEG, PNG, WebP, or GIF.`));
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        reject(new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max 5MB.`));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Extract base64 data (remove "data:image/jpeg;base64," prefix)
        const base64 = dataUrl.split(',')[1];
        resolve({
          data: base64,
          media_type: file.type as UploadedImage['media_type'],
          preview: dataUrl,
          name: file.name,
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    setError(null);

    try {
      const newImages: UploadedImage[] = [];
      // Limit to 4 images total
      const remaining = 4 - uploadedImages.length;
      const filesToProcess = Array.from(files).slice(0, remaining);

      for (const file of filesToProcess) {
        const img = await processFile(file);
        newImages.push(img);
      }

      setUploadedImages(prev => [...prev, ...newImages]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      imageFiles.forEach(f => dt.items.add(f));
      handleFileSelect(dt.files);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (recipe && recipeRef.current) {
      recipeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [recipe]);

  // Build a text description of the existing recipe for seeding the conversation
  const buildExistingRecipePrompt = (): string => {
    if (!existingRecipe) return '';
    const ingredients = existingRecipe.components
      .map(c => `${c.qty} ${c.uom} ${c.name} ($${c.cost.toFixed(2)}/${c.uom})`)
      .join(', ');
    return `Here is my existing recipe that I want to rethink:\n\nName: ${existingRecipe.name}\nType: ${existingRecipe.recipe_type} (${existingRecipe.item_category})\nCategory: ${existingRecipe.category}\nYield: ${existingRecipe.yield_qty} ${existingRecipe.yield_uom}\nMenu Price: ${existingRecipe.menu_price ? `$${existingRecipe.menu_price}` : 'not set'}\nCurrent Cost/Unit: ${existingRecipe.cost_per_unit ? `$${existingRecipe.cost_per_unit.toFixed(2)}` : 'unknown'}\nFood Cost Target: ${existingRecipe.food_cost_target}%\nPrep Time: ${existingRecipe.labor_minutes} min\nIngredients: ${ingredients}\n\nPlease rebuild this recipe with the same dish concept but apply your full analysis (allergens, prep breakdown, cost optimization, plating, etc).`;
  };

  const generate = async (userPrompt: string, history: Message[]) => {
    setLoading(true);
    setError(null);

    try {
      // If this is the first message in rethink mode, prepend existing recipe context
      let effectivePrompt = userPrompt;
      if (isRethinkMode && history.length === 0) {
        effectivePrompt = `${buildExistingRecipePrompt()}\n\nChef's direction: ${userPrompt}`;
      }

      // Include images on first message only
      const imagePayload = history.length === 0 && uploadedImages.length > 0
        ? uploadedImages.map(img => ({ data: img.data, media_type: img.media_type }))
        : undefined;

      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          messages: history,
          images: imagePayload,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Something went wrong' }));
        throw new Error(err.message || `Error ${res.status}`);
      }

      const data = await res.json();
      setRecipe(data.recipe);
      setMeta(data.meta);
      setScale(1);

      const newHistory: Message[] = [
        ...history,
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: data.meta.assistant_message },
      ];
      setConversationHistory(newHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recipe');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = prompt.trim().length > 0;
    const hasImages = uploadedImages.length > 0;
    if ((!hasText && !hasImages) || loading) return;
    generate(prompt.trim() || 'Build a recipe from this image', []);
    setPrompt('');
    setUploadedImages([]);
    setConversationHistory([]);
  };

  const handleTweak = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tweakPrompt.trim() || loading) return;
    generate(tweakPrompt.trim(), conversationHistory);
    setTweakPrompt('');
  };

  const handleQuickTweak = (tweakText: string) => {
    if (loading) return;
    generate(tweakText, conversationHistory);
  };

  const handleStartOver = () => {
    setRecipe(null);
    setMeta(null);
    setConversationHistory([]);
    setScale(1);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSaveToBuilder = async () => {
    if (!recipe) return;
    setSaving(true);

    try {
      // Auto-create any unmatched ingredients in the catalog
      const unmatchedIngredients = recipe.ingredients.filter(
        ing => !ing.catalog_item_id && !ing.is_sub_recipe
      );

      let newItemMap = new Map<string, string>(); // ingredient name → catalog item ID

      if (unmatchedIngredients.length > 0) {
        const res = await fetch('/api/items/from-recipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredients: unmatchedIngredients.map(ing => ({
              name: ing.name,
              uom: ing.uom,
              category_hint: recipe.item_category,
              estimated_cost: ing.estimated_cost,
            })),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Failed to add items to catalog' }));
          throw new Error(err.message);
        }

        const { created } = await res.json();
        for (const item of created) {
          newItemMap.set(item.name.toLowerCase(), item.id);
        }
      }

      const components = recipe.ingredients
        .filter(ing => ing.catalog_item_id || ing.is_sub_recipe || newItemMap.has(ing.name.toLowerCase()))
        .map(ing => ({
          type: ing.is_sub_recipe ? 'sub_recipe' : 'item',
          itemId: !ing.is_sub_recipe
            ? (ing.catalog_item_id || newItemMap.get(ing.name.toLowerCase()) || null)
            : null,
          subRecipeId: ing.is_sub_recipe ? ing.catalog_item_id : null,
          qty: ing.qty * scale,
          uom: ing.uom,
          name: ing.catalog_item_name || ing.name,
          cost: ing.estimated_cost,
        }));

      const filteredComponents = components.filter(c => c.itemId || c.subRecipeId);

      if (existingRecipe) {
        // Rethink mode: create a new version of the existing recipe
        const versionRes = await fetch('/api/recipes/versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipe_id: existingRecipe.id,
            change_notes: `AI rethink: ${conversationHistory.find(m => m.role === 'user')?.content || 'Recipe rebuilt via AI chat'}`,
          }),
        });

        if (!versionRes.ok) {
          const err = await versionRes.json().catch(() => ({ message: 'Failed to create version' }));
          throw new Error(err.message);
        }

        const versionData = await versionRes.json();
        const newVersionId = versionData.recipe?.id || existingRecipe.id;

        // Update the new version with AI-generated data
        const updateRes = await fetch(`/api/recipes/${newVersionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: recipe.name,
            recipe_type: recipe.recipe_type,
            item_category: recipe.item_category,
            category: recipe.category,
            yield_qty: recipe.yield_qty * scale,
            yield_uom: recipe.yield_uom,
            labor_minutes: recipe.labor_minutes,
            menu_price: recipe.menu_price || recipe.suggested_menu_price,
            food_cost_target: recipe.food_cost_target,
            components: filteredComponents,
          }),
        });

        if (!updateRes.ok) {
          const err = await updateRes.json().catch(() => ({ message: 'Failed to update recipe' }));
          throw new Error(err.message);
        }

        router.push(`/recipes/${newVersionId}`);
      } else {
        // New recipe: create fresh
        const res = await fetch('/api/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: recipe.name,
            recipe_type: recipe.recipe_type,
            item_category: recipe.item_category,
            category: recipe.category,
            yield_qty: recipe.yield_qty * scale,
            yield_uom: recipe.yield_uom,
            labor_minutes: recipe.labor_minutes,
            menu_price: recipe.menu_price || recipe.suggested_menu_price,
            food_cost_target: recipe.food_cost_target,
            components: filteredComponents,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Failed to save' }));
          throw new Error(err.message);
        }

        const data = await res.json();
        router.push(`/recipes/${data.recipe.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (recipe) {
        handleTweak(e as unknown as React.FormEvent);
      } else {
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
  };

  const scaledCost = (cost: number | null, qty: number) => {
    if (cost === null) return null;
    return cost * qty * scale;
  };

  // ─── Initial state: single input ───
  if (!recipe && !loading) {
    // Rethink mode: show existing recipe context
    if (isRethinkMode && existingRecipe) {
      const RETHINK_PROMPTS = [
        'Rebuild it — keep the concept, improve everything',
        'Make it more cost-effective without losing quality',
        'Modernize the technique and plating',
        'Make it work for a larger party (banquet style)',
        'Simplify for a faster line execution',
        'Create a seasonal variation',
      ];

      return (
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brass/10 mb-4">
              <RotateCcw className="w-8 h-8 text-brass" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Rethink: {existingRecipe.name}</h1>
            <p className="text-muted-foreground">
              I have the current recipe loaded. Tell me what direction you want to take it.
            </p>
          </div>

          {/* Current recipe summary */}
          <Card className="p-4 mb-6 bg-keva-sage-50 border-keva-sage-200">
            <p className="text-sm font-semibold mb-2">Current recipe</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Yield: {existingRecipe.yield_qty} {existingRecipe.yield_uom}</span>
              <span>Cost: ${existingRecipe.cost_per_unit?.toFixed(2) || '?'}/{existingRecipe.yield_uom}</span>
              <span>Menu: {existingRecipe.menu_price ? `$${existingRecipe.menu_price}` : 'not set'}</span>
              <span>Target: {existingRecipe.food_cost_target}%</span>
              <span className="col-span-2">{existingRecipe.components.length} ingredients</span>
            </div>
          </Card>

          <form onSubmit={handleSubmit}>
            {/* Image upload for rethink mode */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`mb-4 border-2 border-dashed rounded-xl transition-colors ${
                dragOver ? 'border-brass bg-brass/5' :
                uploadedImages.length > 0 ? 'border-keva-sage-300 bg-keva-sage-50' :
                'border-keva-sage-200 hover:border-keva-sage-300'
              }`}
            >
              {uploadedImages.length > 0 ? (
                <div className="p-3">
                  <div className="flex flex-wrap gap-3">
                    {uploadedImages.map((img, i) => (
                      <div key={i} className="relative group">
                        <img src={img.preview} alt={img.name} className="w-20 h-20 object-cover rounded-lg border border-keva-sage-200" />
                        <button type="button" onClick={() => removeImage(i)} className="absolute -top-2 -right-2 w-5 h-5 bg-keva-error text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {uploadedImages.length < 4 && (
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="w-20 h-20 border-2 border-dashed border-keva-sage-300 rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-brass hover:text-brass transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full p-4 flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors">
                  <Camera className="w-5 h-5 opacity-40" />
                  <span className="text-sm">Upload updated notes or reference photos</span>
                </button>
              )}
            </div>

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={e => handleFileSelect(e.target.files)} />

            <div className="relative">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="What direction do you want to take this? e.g., 'make it dairy-free and cheaper', 'modernize the technique'..."
                rows={3}
                className="w-full px-4 py-4 pr-14 border-2 border-keva-sage-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-brass focus:border-brass resize-none"
              />
              <Button
                type="submit"
                variant="brass"
                size="sm"
                disabled={!prompt.trim() && uploadedImages.length === 0}
                className="absolute bottom-3 right-3 rounded-lg"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-keva-error-50 border border-keva-error-200 rounded-md text-sm text-keva-error-700">
              {error}
            </div>
          )}

          <div className="mt-6">
            <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">Quick directions</p>
            <div className="flex flex-wrap gap-2">
              {RETHINK_PROMPTS.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setPrompt(example);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 text-sm border border-keva-sage-200 rounded-full hover:bg-keva-sage-50 hover:border-brass/40 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <Button variant="ghost" size="sm" asChild>
              <a href={`/recipes/${existingRecipe.id}`}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to recipe
              </a>
            </Button>
          </div>
        </div>
      );
    }

    // Normal mode: fresh recipe
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brass/10 mb-4">
            <ChefHat className="w-8 h-8 text-brass" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">What are you making?</h1>
          <p className="text-muted-foreground">
            Describe your dish, snap a photo of something you made, or upload your handwritten notes. I&apos;ll build the recipe, match ingredients from your catalog, and cost it out.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Image upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`mb-4 border-2 border-dashed rounded-xl transition-colors ${
              dragOver
                ? 'border-brass bg-brass/5'
                : uploadedImages.length > 0
                  ? 'border-keva-sage-300 bg-keva-sage-50'
                  : 'border-keva-sage-200 hover:border-keva-sage-300'
            }`}
          >
            {uploadedImages.length > 0 ? (
              <div className="p-3">
                <div className="flex flex-wrap gap-3">
                  {uploadedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img.preview}
                        alt={img.name}
                        className="w-24 h-24 object-cover rounded-lg border border-keva-sage-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-keva-error text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {uploadedImages.length < 4 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-24 h-24 border-2 border-dashed border-keva-sage-300 rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-brass hover:text-brass transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-[10px]">Add more</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Camera className="w-8 h-8 opacity-40" />
                <span className="text-sm font-medium">Snap a dish you made, upload recipe notes, or paste a cookbook page</span>
                <span className="text-xs opacity-60">Drop image here, paste from clipboard, or click to browse — AI will reverse-engineer the recipe</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={e => handleFileSelect(e.target.files)}
          />

          {/* Text input */}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={uploadedImages.length > 0
                ? 'Add any notes... or just hit Enter to build from the image'
                : 'Seared duck breast with cherry gastrique, 6 portions, under $11 cost...'}
              rows={3}
              className="w-full px-4 py-4 pr-14 border-2 border-keva-sage-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-brass focus:border-brass resize-none"
            />
            <Button
              type="submit"
              variant="brass"
              size="sm"
              disabled={!prompt.trim() && uploadedImages.length === 0}
              className="absolute bottom-3 right-3 rounded-lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-keva-error-50 border border-keva-error-200 rounded-md text-sm text-keva-error-700">
            {error}
          </div>
        )}

        <div className="mt-8">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">Try something like</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                onClick={() => {
                  if (example.startsWith('Drop a photo')) {
                    fileInputRef.current?.click();
                  } else {
                    setPrompt(example);
                    inputRef.current?.focus();
                  }
                }}
                className="px-3 py-1.5 text-sm border border-keva-sage-200 rounded-full hover:bg-keva-sage-50 hover:border-brass/40 transition-colors text-muted-foreground hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* How to use */}
        <div className="mt-8 p-4 bg-keva-sage-50 border border-keva-sage-200 rounded-xl">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-semibold">How to use</p>
          <div className="space-y-4">
            {/* Two modes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded-lg border border-keva-sage-200">
                <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <ChefHat className="w-4 h-4 text-brass" /> Build a Recipe
                </p>
                <p className="text-xs text-muted-foreground">
                  Describe what you&apos;re making — &quot;seared duck, cherry gastrique, 6 portions.&quot; AI builds it with ingredients from your catalog, method, allergens, costs, and shelf life.
                </p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-keva-sage-200">
                <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-brass" /> Reverse-Engineer a Dish
                </p>
                <p className="text-xs text-muted-foreground">
                  Snap a photo of something you made or upload a picture. AI identifies the dish, reverse-engineers a full recipe, matches ingredients to your catalog, and costs it.
                </p>
              </div>
            </div>
            {/* Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <span className="text-brass font-bold">1.</span>
                <span><span className="text-foreground font-medium">Describe, upload, or paste</span> — text, dish photo, handwritten notes, cookbook page</span>
              </div>
              <div className="flex gap-2">
                <span className="text-brass font-bold">2.</span>
                <span><span className="text-foreground font-medium">Iterate via chat</span> — &quot;make it cheaper&quot;, &quot;swap protein&quot;, &quot;dairy-free&quot;, &quot;bigger batch&quot;</span>
              </div>
              <div className="flex gap-2">
                <span className="text-brass font-bold">3.</span>
                <span><span className="text-foreground font-medium">Save</span> — commit to Recipe Builder for production use</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading state ───
  if (loading && !recipe) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-brass mx-auto mb-4" />
        <p className="text-lg text-muted-foreground">Building your recipe...</p>
        <p className="text-sm text-muted-foreground mt-1">Matching ingredients, checking costs, flagging allergens</p>
      </div>
    );
  }

  // ─── Recipe result ───
  if (!recipe) return null;

  const totalScaledCost = recipe.ingredients.reduce(
    (sum, ing) => sum + (scaledCost(ing.estimated_cost, ing.qty) || 0), 0
  );
  const costPerUnit = recipe.yield_qty * scale > 0
    ? totalScaledCost / (recipe.yield_qty * scale)
    : 0;
  const effectiveMenuPrice = recipe.menu_price || recipe.suggested_menu_price;
  const foodCostPct = effectiveMenuPrice && effectiveMenuPrice > 0
    ? (costPerUnit / effectiveMenuPrice) * 100
    : null;

  const catalogMatchedCount = recipe.ingredients.filter(i => i.catalog_item_id && !i.is_sub_recipe).length;
  const newItemCount = recipe.ingredients.filter(i => !i.catalog_item_id && !i.is_sub_recipe).length;

  return (
    <div className="max-w-4xl mx-auto" ref={recipeRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={handleStartOver}>
          <RotateCcw className="w-4 h-4 mr-1" /> Start over
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href="/recipes">
            <ArrowLeft className="w-4 h-4 mr-1" /> All Recipes
          </a>
        </Button>
      </div>

      {/* Loading overlay for tweaks */}
      {loading && (
        <div className="mb-4 p-3 bg-brass/5 border border-brass/20 rounded-lg flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-brass" />
          <span className="text-sm text-muted-foreground">Updating recipe...</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Recipe Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recipe Title, Meta & Allergens */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold mb-2">{recipe.name}</h2>

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="sage">{recipe.item_category}</Badge>
              <Badge variant="outline">{recipe.category}</Badge>
              {recipe.cooking_method && (
                <Badge variant="outline" className="gap-1">
                  <Flame className="w-3 h-3" /> {recipe.cooking_method}
                </Badge>
              )}
              {recipe.prep_style && (
                <Badge variant="outline" className="gap-1">
                  <Utensils className="w-3 h-3" /> {recipe.prep_style}
                </Badge>
              )}
              <Badge variant="outline">
                {recipe.yield_qty * scale} {recipe.yield_uom}{recipe.yield_qty * scale !== 1 ? 's' : ''}
              </Badge>
              {recipe.labor_minutes > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" /> {recipe.labor_minutes} min
                </Badge>
              )}
            </div>

            {/* Portion weight */}
            {recipe.portion_weight && (
              <p className="text-sm text-muted-foreground mb-3">
                <Scale className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                <span className="font-medium">Portion:</span> {recipe.portion_weight}
              </p>
            )}

            {/* Allergens */}
            {recipe.allergens && recipe.allergens.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-red-700 mr-1">ALLERGENS:</span>
                <div className="flex flex-wrap gap-1">
                  {recipe.allergens.map(a => (
                    <span
                      key={a}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        ALLERGEN_COLORS[a.toLowerCase()] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Scale selector */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground font-medium">Scale:</span>
              {SCALE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    scale === s
                      ? 'bg-brass text-white font-semibold'
                      : 'border border-keva-sage-200 hover:bg-keva-sage-50'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </Card>

          {/* Ingredients */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Ingredients</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {catalogMatchedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <PackageOpen className="w-3 h-3" /> {catalogMatchedCount} from catalog
                  </span>
                )}
                {newItemCount > 0 && (
                  <span className="flex items-center gap-1 text-brass">
                    <Plus className="w-3 h-3" /> {newItemCount} to add
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              {recipe.ingredients.map((ing, i) => {
                const lineCost = scaledCost(ing.estimated_cost, ing.qty);
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between py-2 px-3 rounded-md ${
                      !ing.catalog_item_id && !ing.is_sub_recipe
                        ? 'bg-brass/5 border border-brass/20'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {ing.is_sub_recipe && (
                        <Badge variant="brass" className="text-[10px] py-0">sub-recipe</Badge>
                      )}
                      {!ing.catalog_item_id && !ing.is_sub_recipe && (
                        <Badge variant="outline" className="text-[10px] py-0 border-brass/40 text-brass">+ add to catalog</Badge>
                      )}
                      <span className="text-sm font-medium">
                        {ing.catalog_item_name || ing.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground font-mono">
                        {(ing.qty * scale).toFixed(ing.qty * scale % 1 === 0 ? 0 : 2)} {ing.uom}
                      </span>
                      {lineCost !== null && (
                        <span className="font-mono w-16 text-right">
                          ${lineCost.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Prep Breakdown (prep_ahead + a_la_minute) */}
          {((recipe.prep_ahead && recipe.prep_ahead.length > 0) ||
            (recipe.a_la_minute && recipe.a_la_minute.length > 0)) && (
            <Card className="p-6">
              <button
                onClick={() => setShowPrepBreakdown(!showPrepBreakdown)}
                className="flex items-center justify-between w-full"
              >
                <h3 className="font-semibold">Prep Breakdown</h3>
                {showPrepBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPrepBreakdown && (
                <div className="mt-4 space-y-5">
                  {recipe.prep_ahead && recipe.prep_ahead.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-keva-sage-700 mb-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Prep Ahead (Mise en Place)
                      </h4>
                      <ol className="space-y-2 ml-1">
                        {recipe.prep_ahead.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-keva-sage-100 text-keva-sage-700 flex items-center justify-center text-xs font-semibold">
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {recipe.a_la_minute && recipe.a_la_minute.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-brass mb-2 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5" /> À La Minute (During Service)
                      </h4>
                      <ol className="space-y-2 ml-1">
                        {recipe.a_la_minute.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brass/10 text-brass flex items-center justify-center text-xs font-semibold">
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Full Method (collapsed by default since prep breakdown is primary) */}
          <Card className="p-6">
            <button
              onClick={() => setShowMethod(!showMethod)}
              className="flex items-center justify-between w-full"
            >
              <h3 className="font-semibold">Full Method</h3>
              {showMethod ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showMethod && (
              <ol className="mt-4 space-y-3">
                {recipe.method.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-keva-sage-100 text-keva-sage-700 flex items-center justify-center text-xs font-semibold">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Shelf Life & Storage */}
          {(recipe.shelf_life || recipe.storage_notes) && (
            <Card className="p-4 border-keva-sage-200">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {recipe.shelf_life && (
                  <p>
                    <span className="font-semibold">Shelf Life: </span>
                    {recipe.shelf_life}
                  </p>
                )}
                {recipe.storage_notes && (
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground">Storage: </span>
                    {recipe.storage_notes}
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Plating Notes */}
          {recipe.plating_notes && (
            <Card className="p-4 bg-keva-sage-50 border-keva-sage-200">
              <p className="text-sm">
                <span className="font-semibold">Plating: </span>
                {recipe.plating_notes}
              </p>
            </Card>
          )}

          {/* Chef Notes */}
          {recipe.chef_notes && (
            <Card className="p-4 bg-brass/5 border-brass/20">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Chef Notes: </span>
                {recipe.chef_notes}
              </p>
            </Card>
          )}

          {/* Cost Optimization Alert */}
          {recipe.cost_optimization && (
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex gap-2">
                <DollarSign className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Cost Optimization</p>
                  <p className="text-sm text-amber-700 mt-0.5">{recipe.cost_optimization}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar: Cost Summary + Actions */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-6 sticky top-8">
            <h3 className="font-semibold mb-4">Cost Summary</h3>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ingredient Cost</span>
                <span className="font-mono">${totalScaledCost.toFixed(2)}</span>
              </div>

              {recipe.labor_minutes > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Prep Time</span>
                  <span className="font-mono">{recipe.labor_minutes} min</span>
                </div>
              )}

              <div className="border-t pt-3">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">Cost per {recipe.yield_uom}</span>
                  <span className="font-mono font-bold text-lg text-brass">
                    ${costPerUnit.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Total ({(recipe.yield_qty * scale).toFixed(recipe.yield_qty * scale % 1 === 0 ? 0 : 1)} {recipe.yield_uom}s)
                  </span>
                  <span className="font-mono">${totalScaledCost.toFixed(2)}</span>
                </div>
              </div>

              {/* Menu price section */}
              <div className="border-t pt-3">
                {recipe.menu_price && recipe.menu_price > 0 ? (
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Menu Price</span>
                    <span className="font-mono">${recipe.menu_price.toFixed(2)}</span>
                  </div>
                ) : recipe.suggested_menu_price ? (
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Suggested Price</span>
                    <span className="font-mono text-brass font-semibold">
                      ${recipe.suggested_menu_price.toFixed(0)}
                    </span>
                  </div>
                ) : null}

                {foodCostPct !== null && (
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">
                      {recipe.item_category === 'food' ? 'Food Cost %' : 'Pour Cost %'}
                    </span>
                    <span className={`font-mono font-bold text-lg ${
                      foodCostPct <= recipe.food_cost_target ? 'text-keva-sage-600' :
                      foodCostPct <= recipe.food_cost_target + 7 ? 'text-brass' :
                      'text-keva-error'
                    }`}>
                      {foodCostPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Target: {recipe.food_cost_target}%
                </p>
              </div>

              {/* Catalog match summary */}
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Catalog matches</span>
                  <span className="font-mono">{catalogMatchedCount}/{recipe.ingredients.length}</span>
                </div>
                {newItemCount > 0 && (
                  <p className="text-xs text-brass">
                    {newItemCount} ingredient{newItemCount > 1 ? 's' : ''} not in catalog
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="border-t pt-3 space-y-2">
                <Button
                  className="w-full"
                  variant="brass"
                  onClick={handleSaveToBuilder}
                  disabled={saving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving
                    ? (newItemCount > 0 ? 'Adding to catalog & saving...' : 'Saving...')
                    : existingRecipe
                      ? 'Save as New Version'
                      : 'Save to Recipe Builder'}
                </Button>

                {existingRecipe && (
                  <p className="text-xs text-muted-foreground text-center">
                    Creates a new version — previous version preserved in history
                  </p>
                )}

                {newItemCount > 0 && !saving && (
                  <p className="text-xs text-brass text-center">
                    {newItemCount} new item{newItemCount > 1 ? 's' : ''} will be added to your catalog on save
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Tweak Buttons */}
      <div className="mt-6">
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">Quick tweaks</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_TWEAKS.map(tweak => (
            <button
              key={tweak.label}
              onClick={() => handleQuickTweak(tweak.prompt)}
              disabled={loading}
              className="px-3 py-1.5 text-sm border border-keva-sage-200 rounded-full hover:bg-keva-sage-50 hover:border-brass/40 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {tweak.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tweak bar (custom refinement) */}
      <div className="mt-4 mb-8">
        <form onSubmit={handleTweak} className="relative">
          <textarea
            value={tweakPrompt}
            onChange={e => setTweakPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Or describe your own tweak... &quot;swap protein for halibut&quot;, &quot;add a truffle component&quot;, &quot;make it work for 40 covers&quot;"
            rows={2}
            disabled={loading}
            className="w-full px-4 py-3 pr-14 border-2 border-keva-sage-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brass focus:border-brass resize-none disabled:opacity-50"
          />
          <Button
            type="submit"
            variant="brass"
            size="sm"
            disabled={!tweakPrompt.trim() || loading}
            className="absolute bottom-2.5 right-3 rounded-lg"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>

      {error && (
        <div className="mb-8 p-3 bg-keva-error-50 border border-keva-error-200 rounded-md text-sm text-keva-error-700">
          {error}
        </div>
      )}
    </div>
  );
}
