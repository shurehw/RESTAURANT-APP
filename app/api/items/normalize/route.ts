import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    const prompt = `You are an expert at normalizing restaurant inventory item names from invoice descriptions.

Given this raw invoice description: "${description}"

Extract and normalize the following information:

1. **Item Name**: Clean, standardized name WITH unit size (for identification)
   - KEEP: Unit size (1lb, 750ml, 12oz, 1gal, 3L, etc.) - this is the ITEM SIZE
   - REMOVE: Pack counts (4/1, 6/4, 6/750ml, 24pk, CS, BOX, etc.) - this goes in pack config
   - Remove vendor codes (Pitt#, SKU:, Code:, Item#, etc.)
   - Remove OCR artifacts (Case*, asterisks, truncated words)
   - Use proper capitalization (Title Case)
   - Keep acronyms uppercase (EVOO, USDA, IPA, etc.)
   - For juices: format as "[Fruit] Juice - [Type] SIZE" (e.g., "Orange Juice - Cold Pressed 1gal")
   - For oils: expand abbreviations (EVOO → "Extra Virgin Olive Oil")
   - For beers: "Brand Variant SIZE" (e.g., "Estrella Jalisco 12oz", "Deep Ellum Dallas Blonde 12oz")
   - For spirits: "Brand Variant SIZE" (e.g., "Noilly Prat Dry Vermouth 1L", "Gyre's Pink Gin 700ml")
   - For produce/food: "Item Name SIZE" (e.g., "Zucchini Squash - Green 1lb", "Zaatar 1lb")

   IMPORTANT DISTINCTION:
   - Item name = "Estrella Jalisco 12oz" (the single bottle/unit)
   - Pack config = "6/case" or "24/case" (how it's sold)

   EXAMPLES:
   - "Case*Estrella Jalisco*Lot 5 12OZ" → "Estrella Jalisco 12oz"
   - "Zucchini Squash, Green 1lb" → "Zucchini Squash - Green 1lb"
   - "Zaatar 1lb" → "Zaatar 1lb"
   - "Yuzu Ponzu 1gal" → "Yuzu Ponzu 1gal"
   - "ECONOMY BUS TUB BLA CK 7\"" → "Economy Bus Tub - Black 7in"
   - "Gyre's Pink London Spirit* 700ML" → "Gyre's Pink Gin 700ml"
   - "Case*Noilly Prat Vermouth O 1LT" → "Noilly Prat Dry Vermouth 1L"

2. **Category**: Restaurant inventory category
   - Bar Consumables (mixers, juices for cocktails, syrups, bitters)
   - Wine & Spirits (alcohol)
   - Beverages (non-alcoholic retail drinks)
   - Produce (fresh fruits, vegetables)
   - Dairy (cheese, butter, milk, cream, yogurt)
   - Meat & Seafood
   - Dry Goods (flour, sugar, rice, pasta, beans)
   - Oils & Vinegars
   - Spices & Seasonings
   - Packaging (disposables, to-go containers)
   - Cleaning Supplies
   - Paper Products
   - Uncategorized (if unclear)

3. **UOM** (Unit of Measure): The smallest sellable unit
   - L (liter)
   - gal (gallon)
   - qt (quart)
   - pt (pint)
   - oz (ounce)
   - lb (pound)
   - case
   - box
   - unit (for each/ea)

4. **Pack Size**: Descriptive pack format (e.g., "4/1 Gallon", "10L Bag-in-Box", "6/750ml")
   - Empty string if not applicable

5. **Outer Pack Qty**: How many units in the case (e.g., "4" for 4/1 gal, "6" for 6/750ml, "1" for single items)
   - The number BEFORE the slash in "4/1 GAL" or "6/4 LB"
   - Use "1" if it's a single item (e.g., "10L BIB" = 1 bag)

6. **Inner Pack Qty**: Size of each individual unit (e.g., "1" for 4/1 gal, "4" for 6/4 lb, "10" for 10L)
   - The number AFTER the slash, or the size if no slash
   - For "4/1 GAL" → inner is "1"
   - For "1/5 LB" → inner is "5"
   - For "10L BIB" → inner is "10"

7. **Inner Pack UOM**: Unit of measure for the inner pack (gal, L, lb, oz, etc.)
   - For "4/1 GAL" → "gal"
   - For "1/5 LB" → "lb"
   - For "10L BIB" → "L"

8. **SKU**: Generate a short, memorable SKU code (6-12 characters)
   - Use vendor abbreviation if recognizable (e.g., "HELL" for Hellmans, "TRULY" for Truly)
   - Add product type abbreviation (e.g., "MAYO", "EVOO", "WNUT")
   - Add size if relevant (e.g., "4G", "10L", "5LB")
   - Format: VENDOR-PRODUCT-SIZE (e.g., "HELL-MAYO-4G", "TRULY-EVOO-10L")
   - Keep it short but descriptive
   - All uppercase, use hyphens as separators

**Examples:**
- "MAYO HELLMANS EXTRA HEAVY 4/1 GAL BC Pitt# 7"
  → outer: 4, inner: 1, innerUom: gal, packSize: "4/1 Gallon"
- "EVOO TRULY 1/10 LT CS Pitt# 7"
  → outer: 1, inner: 10, innerUom: L, packSize: "10L"
- "WALNUT HALVES 1/5 LB BOX CS Pitt# 7"
  → outer: 1, inner: 5, innerUom: lb, packSize: "5 lb Box"

Return ONLY a JSON object with these exact keys:
{
  "name": "Normalized Item Name",
  "category": "Category Name",
  "uom": "unit type",
  "packSize": "Pack Size Description",
  "outerPackQty": "numeric value",
  "innerPackQty": "numeric value",
  "innerPackUom": "unit type",
  "sku": "GENERATED-SKU-CODE"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let jsonText = textContent.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const normalized = JSON.parse(jsonText);

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('Normalization error:', error);
    return NextResponse.json(
      { error: 'Failed to normalize item' },
      { status: 500 }
    );
  }
}
