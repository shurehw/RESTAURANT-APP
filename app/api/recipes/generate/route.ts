import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ImageInput {
  data: string; // base64
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

interface GeneratedIngredient {
  name: string;
  qty: number;
  uom: string;
  estimated_cost: number | null;
  catalog_item_id: string | null;
  catalog_item_name: string | null;
  is_sub_recipe: boolean;
}

interface GeneratedRecipe {
  name: string;
  recipe_type: 'prepared_item' | 'menu_item';
  item_category: 'food' | 'beverage' | 'liquor' | 'wine' | 'beer' | 'spirits';
  category: string;
  yield_qty: number;
  yield_uom: string;
  labor_minutes: number;
  menu_price: number | null;
  suggested_menu_price: number | null;
  food_cost_target: number;
  cooking_method: string;
  prep_style: string;
  allergens: string[];
  ingredients: GeneratedIngredient[];
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

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':recipes-generate');
    const user = await requireUser();
    const { orgId, venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const { prompt, messages: conversationHistory, venue_id, images } = body as {
      prompt: string;
      messages?: Message[];
      venue_id?: string;
      images?: ImageInput[];
    };

    // Allow image-only requests (no text prompt required if images present)
    const hasImages = images && images.length > 0;
    if ((!prompt || prompt.trim().length < 3) && !hasImages) {
      throw { status: 400, code: 'INVALID_PROMPT', message: 'Tell me what you\'re making' };
    }

    const venueId = venue_id && venueIds.includes(venue_id) ? venue_id : venueIds[0];

    const adminClient = createAdminClient();
    const supabase = await createClient();

    // Pull venue info for restaurant context
    const { data: venue } = await adminClient
      .from('venues')
      .select('name, city, state')
      .eq('id', venueId)
      .single();

    // Pull current menu items (mapped recipes with sales data from last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: menuItems } = await (adminClient as any)
      .from('menu_item_recipe_map')
      .select('menu_item_name, recipes(name, item_category, menu_price, cost_per_unit)')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .limit(100);

    // Pull catalog items with costs for context
    const { data: catalogItems } = await adminClient
      .from('items')
      .select('id, name, category, base_uom')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name')
      .limit(500);

    // Get latest costs for catalog items
    const itemIds = (catalogItems || []).map(i => i.id);
    let costMap = new Map<string, number>();
    if (itemIds.length > 0) {
      const { data: costs } = await supabase
        .from('item_cost_history')
        .select('item_id, unit_cost')
        .in('item_id', itemIds)
        .order('effective_date', { ascending: false });

      (costs || []).forEach(c => {
        if (!costMap.has(c.item_id)) costMap.set(c.item_id, c.unit_cost);
      });
    }

    // Build catalog context for the LLM
    const catalogContext = (catalogItems || [])
      .map(item => {
        const cost = costMap.get(item.id);
        return `- ${item.name} (${item.base_uom}, ${item.category}${cost ? `, $${cost.toFixed(2)}/${item.base_uom}` : ''}) [id:${item.id}]`;
      })
      .join('\n');

    // Also pull existing sub-recipes
    const { data: existingRecipes } = await adminClient
      .from('recipes')
      .select('id, name, recipe_type, category, yield_uom, cost_per_unit')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('name')
      .limit(100);

    const subRecipeContext = (existingRecipes || [])
      .map(r => `- ${r.name} (${r.yield_uom}, ${r.category || r.recipe_type}${r.cost_per_unit ? `, $${r.cost_per_unit}/${r.yield_uom}` : ''}) [recipe_id:${r.id}]`)
      .join('\n');

    // Build current menu context
    const menuContext = (menuItems || [])
      .map((m: any) => {
        const r = m.recipes;
        return r
          ? `- ${m.menu_item_name} (${r.item_category}, $${r.menu_price || '?'} menu / $${r.cost_per_unit?.toFixed(2) || '?'} cost)`
          : `- ${m.menu_item_name}`;
      })
      .join('\n');

    // Seasonal context based on current date
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const seasonMap: Record<number, string> = {
      0: 'winter (January) — citrus, root vegetables, hearty greens, game',
      1: 'winter (February) — citrus, beets, cabbage, turnips',
      2: 'early spring (March) — early greens, asparagus starts, ramps',
      3: 'spring (April) — asparagus, peas, morels, spring onions, lamb',
      4: 'late spring (May) — strawberries, artichokes, fava beans, soft herbs',
      5: 'early summer (June) — stone fruit starts, tomatoes, corn, berries',
      6: 'summer (July) — peak stone fruit, tomatoes, peppers, zucchini, herbs',
      7: 'late summer (August) — figs, melons, eggplant, peak tomatoes',
      8: 'early fall (September) — apples, grapes, squash starts, wild mushrooms',
      9: 'fall (October) — squash, pumpkin, pears, game season, mushrooms',
      10: 'late fall (November) — root vegetables, cranberries, Brussels sprouts, game',
      11: 'winter (December) — citrus, pomegranate, chestnuts, truffles, hearty braises',
    };
    const seasonContext = seasonMap[month] || 'seasonal ingredients';

    const venueName = venue?.name || 'the restaurant';
    const venueLocation = [venue?.city, venue?.state].filter(Boolean).join(', ');

    const systemPrompt = `You are a professional culinary recipe developer working with the kitchen team at ${venueName}${venueLocation ? ` in ${venueLocation}` : ''}. You help chefs build structured, costed recipes from natural language descriptions.

SEASON: It is currently ${seasonContext}. Suggest seasonal ingredients where it fits the dish naturally. Don't force it — if the chef asks for something specific, honor that.

CURRENT MENU — these are dishes currently on the menu at this venue. Use this for context on the restaurant's style, price point, and cuisine direction:
${menuContext || '(No current menu data available)'}

CATALOG — these are ingredients already in our system with known costs. ALWAYS prefer matching to these when possible. Include the catalog item ID when you match:
${catalogContext || '(No catalog items available)'}

EXISTING SUB-RECIPES — these are prepared items that can be used as components:
${subRecipeContext || '(No sub-recipes available)'}

IMAGE INPUTS:
When the chef uploads an image (photo of handwritten notes, cookbook page, screenshot of a recipe, picture of a dish), interpret it intelligently:
- Handwritten prep notes: extract ingredients, quantities, and any method notes. Fill in professional technique where the notes are sparse.
- Cookbook/recipe page: transcribe and adapt for professional kitchen production (convert home measurements to commercial, adjust technique).
- Photo of a finished dish: reverse-engineer a plausible recipe based on what you see. Identify proteins, sauces, garnishes, and technique from visual cues. Estimate ingredient quantities, cooking method, and plating style. Use web_search if you need to research a technique or unfamiliar dish that appears in the photo. Note estimates clearly in chef_notes.
- Screenshot from a website/app: extract the recipe content and restructure it.
Always match extracted ingredients to the catalog where possible.

RULES:
1. When an ingredient matches a catalog item, use the catalog item's name, UOM, and cost. Set catalog_item_id to the ID in brackets.
2. When an ingredient is NOT in the catalog, still include it with your best cost estimate. Set catalog_item_id to null. These will be flagged as "new" items the chef can add to the catalog.
3. Sub-recipes from the existing list can be referenced. Set is_sub_recipe: true and catalog_item_id to the recipe_id.
4. Always provide realistic quantities and professional technique in the method.
5. Cost targets: food 28%, beverage 20%, liquor 18%, wine 22%, beer 20%, spirits 18%.
6. If the chef specifies a cost target, honor it.
7. Be practical — this is for real kitchen production, not home cooking.
8. You have a web_search tool available. USE IT when:
   - The chef asks about an unfamiliar dish, technique, or cuisine you're not confident about
   - You need reference ratios or proportions (e.g., proper emulsion ratios, brining times, fermentation specs)
   - The request involves a trending/modern technique or a regional specialty
   - You want to verify proper technique for something complex (sous vide temps, curing times, etc.)
   Do NOT search for basic/classic preparations you already know well (mother sauces, standard proteins, simple desserts).

9. Always calculate suggested_menu_price from cost_per_unit and food_cost_target: suggested_menu_price = cost_per_unit / (food_cost_target / 100). Round to nearest dollar.
10. Always flag allergens present in the recipe. Common allergens: dairy, eggs, gluten, tree nuts, peanuts, soy, shellfish, fish, sesame.
11. When food cost % exceeds the target, include a cost_optimization suggestion — a specific actionable swap or reduction that brings it under target without compromising the dish. Be specific ("swap X for Y, saves $Z/portion"), not generic.
12. Separate method into prep_ahead (mise en place, can be done in advance) and a_la_minute (done during service/plating). Also include the full combined method array.
13. Identify the primary cooking_method (e.g., "sear", "braise", "sous vide", "raw", "grill", "roast", "fry", "smoke", "poach", "confit") and prep_style (e.g., "à la minute", "batch prep", "family meal", "banquet", "tasting menu", "bar prep").
14. Always specify portion_weight — the target protein/main component weight per portion (e.g., "8oz duck breast", "6oz filet", "4oz tartare"). This is what the line cook uses for portioning consistency.
15. Include plating_notes when relevant — brief plating description for the pass (component placement, garnish, sauce work).
16. Always include shelf_life — how long the finished product holds (e.g., "7 days refrigerated", "3 days covered", "use immediately"). Include storage_notes for storage instructions (e.g., "Cool rapidly, store in 6qt cambro, label with date").
17. Use metric weights (grams, kilograms) for solid ingredients when the quantities are large-batch/professional. Use volume (mL, L) for liquids. This matches professional kitchen standards. For small quantities (herbs, spices), grams are fine. Only use imperial if the chef explicitly requests it.

When you are ready to output the final recipe, respond with ONLY valid JSON matching this exact schema (no markdown, no backticks):
{
  "name": "string — professional recipe name",
  "recipe_type": "prepared_item" | "menu_item",
  "item_category": "food" | "beverage" | "liquor" | "wine" | "beer" | "spirits",
  "category": "string — subcategory like appetizer, entree, sauce, dessert, cocktail",
  "cooking_method": "string — primary technique: sear, braise, sous vide, grill, roast, raw, etc.",
  "prep_style": "string — à la minute, batch prep, family meal, banquet, tasting menu, bar prep",
  "yield_qty": number,
  "yield_uom": "string — portion, oz, cup, each, etc.",
  "labor_minutes": number,
  "menu_price": number | null,
  "suggested_menu_price": number — calculated from cost_per_unit / (food_cost_target / 100),
  "food_cost_target": number,
  "allergens": ["dairy", "gluten", "..."],
  "ingredients": [
    {
      "name": "string",
      "qty": number,
      "uom": "string",
      "estimated_cost": number | null,
      "catalog_item_id": "string | null — the ID from the catalog, or null if new",
      "catalog_item_name": "string | null — the matched catalog name, or null",
      "is_sub_recipe": false
    }
  ],
  "prep_ahead": ["mise en place step 1", "step 2 — can be done hours/day before service"],
  "a_la_minute": ["step done during service/plating 1", "step 2"],
  "method": ["full combined step 1", "step 2", "..."],
  "chef_notes": "string — any notes on technique, substitutions, or plating",
  "cost_optimization": "string | null — specific swap or reduction to hit food cost target, only if over target",
  "portion_weight": "string — target weight per portion for line consistency, e.g. '8oz duck breast'",
  "plating_notes": "string | null — brief plating description for the pass",
  "shelf_life": "string — how long it holds, e.g. '7 days refrigerated', 'use immediately'",
  "storage_notes": "string | null — storage instructions, e.g. 'Cool rapidly, store in cambro, label with date'",
  "total_cost": number,
  "cost_per_unit": number
}`;

    // Build conversation messages
    const messages: Anthropic.MessageParam[] = [];
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Build the user message — text only or multimodal (images + text)
    if (hasImages) {
      const contentBlocks: Anthropic.ContentBlockParam[] = [];

      // Add images first so the model sees them before the text instruction
      for (const img of images!) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.media_type,
            data: img.data,
          },
        });
      }

      // Add text prompt (or default instruction for image-only)
      contentBlocks.push({
        type: 'text',
        text: prompt?.trim() || 'Read this image and build a structured, costed recipe from what you see. Extract all ingredients, quantities, and method steps. If it\'s handwritten notes, interpret them as a professional chef would.',
      });

      messages.push({ role: 'user', content: contentBlocks });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    // Agentic loop: Claude can use web_search tool to research recipes/techniques
    // before producing the final JSON output
    const MAX_TOOL_ROUNDS = 3;
    let assistantText = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 3,
          } as any,
        ],
      });

      // Collect text blocks from this response
      const textBlocks = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.TextBlock).text)
        .join('');

      // Check if there are tool uses (web search calls)
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use' || block.type === 'web_search_tool_result');

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        // No more tool calls — we have our final text
        assistantText = textBlocks;
        break;
      }

      // Model used tools — add the full assistant response and tool results to messages
      // so the conversation continues. The API handles web_search results automatically
      // via server-side tool execution, so we just need to continue the loop.
      messages.push({ role: 'assistant', content: response.content as any });

      // For web_search, results come back inline in the response content.
      // If stop_reason is 'tool_use', we need to send back tool results.
      // But web_search is server-side executed, so results are already in content.
      // We just continue the conversation.
      if (response.stop_reason === 'tool_use') {
        // The web search results are already embedded in the response.
        // We need to provide a user turn to continue.
        messages.push({ role: 'user', content: 'Continue with the recipe based on what you found.' });
      }

      // If we got text on this round too, use it
      if (textBlocks) {
        assistantText = textBlocks;
      }
    }

    // Parse the JSON response
    let recipe: GeneratedRecipe;
    try {
      // Strip any markdown code fences if present
      const cleaned = assistantText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      recipe = JSON.parse(cleaned);
    } catch {
      throw { status: 502, code: 'AI_PARSE_ERROR', message: 'Failed to parse recipe from AI response' };
    }

    // Enrich with catalog match info
    const catalogMatched = recipe.ingredients.filter(i => i.catalog_item_id).length;
    const newItems = recipe.ingredients.filter(i => !i.catalog_item_id && !i.is_sub_recipe);

    return NextResponse.json({
      recipe,
      meta: {
        catalog_matched: catalogMatched,
        new_items: newItems.length,
        total_ingredients: recipe.ingredients.length,
        assistant_message: assistantText,
      },
    });
  });
}
