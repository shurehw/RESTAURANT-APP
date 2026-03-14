/**
 * AI Procurement Classifier
 *
 * Uses Claude to classify items into Binyan entity codes for routing.
 * Falls back to rule-based classification from the policy contract
 * when AI is unavailable or for high-confidence simple cases.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  type EntityCode,
  classifyItemEntity,
} from '@/lib/ai/procurement-agent-policy';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Types ──────────────────────────────────────────────────────

export interface ClassificationInput {
  id: string;
  name: string;
  category: string;
  tags?: string[];
}

export interface ClassificationResult {
  item_id: string;
  entity_code: EntityCode;
  confidence: number;
  reason: string;
}

// ── AI Classification ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a procurement routing classifier for a restaurant operations platform.

Your job is to classify inventory items into the correct supplier entity for procurement routing.

ENTITY CODES AND WHAT THEY HANDLE:

- "shw" (SHW Distribution): Food ingredients, beverages, general supplies, disposables, paper goods. This is the default distributor for consumable restaurant supplies.

- "shureprint" (Shureprint): Packaging, custom printed materials, branded items, to-go containers with branding, menus, signage, receipt paper with branding.

- "ee_mercantile" (E&E Mercantile): Tabletop items (plates, bowls, platters), glassware, barware, uniforms, linens, furniture, OS&E (operating supplies & equipment), smallwares.

- "groundops" (GroundOps): Cleaning supplies, janitorial products, facility maintenance items, pest control supplies, restroom supplies.

- "external": Items that don't clearly fit any of the above entities. Use this sparingly — most restaurant items fit one of the four entities above.

CLASSIFICATION RULES:
1. Food and beverage ingredients → always "shw"
2. If an item name contains "branded", "custom print", "logo" → "shureprint"
3. Glasses, plates, silverware, uniforms → "ee_mercantile"
4. Cleaning, sanitizer, mop, broom, trash bags → "groundops"
5. Generic paper goods, foil, plastic wrap → "shw"
6. When uncertain, prefer "shw" over "external" for general supplies

Return a JSON array with one object per item:
[{ "item_id": "...", "entity_code": "...", "confidence": 0.0-1.0, "reason": "brief explanation" }]

Return ONLY the JSON array, no markdown fences or extra text.`;

/**
 * Classify a batch of items using AI.
 * Falls back to rule-based classification on failure.
 */
export async function classifyItems(
  items: ClassificationInput[]
): Promise<ClassificationResult[]> {
  if (items.length === 0) return [];

  // Try rule-based first for obvious cases
  const { obvious, needsAI } = triageItems(items);

  if (needsAI.length === 0) return obvious;

  // Batch AI classification
  try {
    const aiResults = await classifyWithAI(needsAI);
    return [...obvious, ...aiResults];
  } catch (err: any) {
    console.error('[ProcurementClassifier] AI classification failed, using rule-based fallback:', err.message);
    // Fall back to rule-based for all remaining
    const fallback = needsAI.map((item) => ({
      item_id: item.id,
      entity_code: classifyItemEntity(item.category, item.tags),
      confidence: 0.5,
      reason: 'Rule-based fallback (AI unavailable)',
    }));
    return [...obvious, ...fallback];
  }
}

/**
 * Separate items that can be classified by rules vs those needing AI.
 */
function triageItems(items: ClassificationInput[]): {
  obvious: ClassificationResult[];
  needsAI: ClassificationInput[];
} {
  const obvious: ClassificationResult[] = [];
  const needsAI: ClassificationInput[] = [];

  for (const item of items) {
    const cat = item.category?.toLowerCase() || '';
    const name = item.name?.toLowerCase() || '';

    // High-confidence rule-based classifications
    if (cat === 'food' || cat === 'beverage') {
      obvious.push({
        item_id: item.id,
        entity_code: 'shw',
        confidence: 0.95,
        reason: `Category "${item.category}" routes to SHW`,
      });
    } else if (name.includes('branded') || name.includes('logo') || name.includes('custom print')) {
      obvious.push({
        item_id: item.id,
        entity_code: 'shureprint',
        confidence: 0.9,
        reason: 'Item name indicates branded/custom print material',
      });
    } else if (cat === 'cleaning' || cat === 'janitorial' || name.includes('sanitiz') || name.includes('mop')) {
      obvious.push({
        item_id: item.id,
        entity_code: 'groundops',
        confidence: 0.9,
        reason: 'Cleaning/janitorial item routes to GroundOps',
      });
    } else {
      needsAI.push(item);
    }
  }

  return { obvious, needsAI };
}

async function classifyWithAI(
  items: ClassificationInput[]
): Promise<ClassificationResult[]> {
  const userPrompt = items
    .map((item) => `- ID: ${item.id} | Name: "${item.name}" | Category: "${item.category || 'unknown'}"${item.tags?.length ? ` | Tags: ${item.tags.join(', ')}` : ''}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Classify these items into entity codes:\n\n${userPrompt}`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON (handle potential markdown fences)
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned) as Array<{
    item_id: string;
    entity_code: string;
    confidence: number;
    reason: string;
  }>;

  // Validate and clamp
  const validEntities = new Set(['shw', 'shureprint', 'ee_mercantile', 'groundops', 'external']);

  return parsed.map((r) => ({
    item_id: r.item_id,
    entity_code: (validEntities.has(r.entity_code) ? r.entity_code : 'external') as EntityCode,
    confidence: Math.min(1, Math.max(0, r.confidence)),
    reason: r.reason || 'AI classified',
  }));
}
