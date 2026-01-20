'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Check, Sparkles } from 'lucide-react';

interface InvoiceLineMapperProps {
  line: {
    id: string;
    description: string;
    qty: number;
    unit_cost: number;
    line_total: number;
  };
  vendorId: string;
}

export function InvoiceLineMapper({ line, vendorId }: InvoiceLineMapperProps) {
  const [searchQuery, setSearchQuery] = useState(line.description);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);

  // Auto-search on mount
  useEffect(() => {
    handleSearch();
  }, []);

  // Search for matching items
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/items/search?q=${encodeURIComponent(searchQuery)}&vendor_id=${vendorId}`);
      const data = await response.json();
      setSuggestions(data.items || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Map line to selected item
  const handleMapItem = async (itemId: string) => {
    try {
      const response = await fetch(`/api/invoices/lines/${line.id}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      });

      if (response.ok) {
        window.location.reload(); // Refresh to show updated mapping
      }
    } catch (error) {
      console.error('Map error:', error);
    }
  };

  // Create new item and map to it
  const handleCreateAndMap = async () => {
    if (!newItemName.trim()) return;

    try {
      // Construct full item name with pack size
      const fullItemName = newItemPackSize
        ? `${newItemName} (${newItemPackSize})`
        : newItemName;

      // Create the new item
      const createResponse = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullItemName,
          sku: newItemSKU || `AUTO-${Date.now()}`,
          category: newItemCategory || 'food',
          subcategory: newItemSubcategory || null,
          base_uom: newItemUOM || 'unit',
          gl_account_id: glAccountId || null,
        }),
      });

      if (!createResponse.ok) {
        alert('Failed to create item');
        return;
      }

      const { item } = await createResponse.json();

      // Map the line to the new item
      await handleMapItem(item.id);
    } catch (error) {
      console.error('Create error:', error);
      alert('Error creating item');
    }
  };

  // Normalize item name by removing size/unit info
  const normalizeItemName = (desc: string): string => {
    let normalized = desc;

    // Remove vendor item codes (Pitt# 7, SKU:123, Code:ABC, etc.)
    normalized = normalized.replace(/\b(pitt#?|sku:?|code:?|item#?)\s*\d+\b/gi, '');

    // Remove pack/case counts (4/1, 6/4, etc. at end of string)
    normalized = normalized.replace(/\b\d+\/\d+\s*(gal|l|oz|lb|cs|case|box|ea|each)?\b/gi, '');

    // Remove common unit patterns (3L, 10L, 5 gal, 1/10 LT CS, etc.)
    normalized = normalized.replace(/\b\d+\/?\d*\s*(l|lt|liter|liters|gal|gallon|gallons|qt|quart|quarts|pt|pint|pints|oz|ounce|ounces|lb|pound|pounds|cs|case|box|ea|each)\b/gi, '');

    // Remove "bib" (bag-in-box) and "bc" (bulk container)
    normalized = normalized.replace(/\b(bib|bc|bag-in-box)\b/gi, '');

    // Remove extra whitespace and punctuation
    normalized = normalized.replace(/\s+/g, ' ').trim();
    normalized = normalized.replace(/^[-\s]+|[-\s]+$/g, '');

    // Capitalize properly - handle special cases
    const words = normalized.split(' ');
    const cleaned = words.map((word, idx) => {
      // Keep % and special chars as-is
      if (word.includes('%')) return word;

      // Keep all-caps acronyms (EVOO, USDA, etc.)
      if (word.length <= 4 && word === word.toUpperCase()) return word;

      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');

    // Add "Juice" if it's a fruit and doesn't already have it
    if (/(orange|lemon|lime|grapefruit|pineapple|apple|cranberry)/i.test(cleaned) && !/juice/i.test(cleaned)) {
      const fruit = cleaned.match(/(orange|lemon|lime|grapefruit|pineapple|apple|cranberry)/i)?.[0];
      if (fruit) {
        const fruitCapitalized = fruit.charAt(0).toUpperCase() + fruit.slice(1).toLowerCase();
        const rest = cleaned.replace(new RegExp(fruit, 'i'), '').trim();
        return rest ? `${fruitCapitalized} Juice - ${rest}` : `${fruitCapitalized} Juice`;
      }
    }

    // Add "Oil" for EVOO if missing
    if (/evoo/i.test(cleaned) && !/oil/i.test(cleaned)) {
      return cleaned.replace(/evoo/i, 'EVOO (Extra Virgin Olive Oil)');
    }

    return cleaned;
  };

  // Parse UOM from description (e.g., "3L", "10L", "5 gal", "1/10 LT CS")
  const parseUOMFromDescription = (desc: string): string => {
    const normalized = desc.toLowerCase();

    // Check for specific patterns in order of priority
    if (/(\d+\s*(l|lt)\b|liter)/i.test(normalized)) return 'L';
    if (/(\d+\s*gal\b|gallon)/i.test(normalized)) return 'gal';
    if (/(\d+\s*qt\b|quart)/i.test(normalized)) return 'qt';
    if (/(\d+\s*pt\b|pint)/i.test(normalized)) return 'pt';
    if (/(\d+\s*oz\b|ounce)/i.test(normalized)) return 'oz';
    if (/(\d+\s*lb\b|pound)/i.test(normalized)) return 'lb';
    if (/(cs\b|case)/i.test(normalized)) return 'case';
    if (/box/i.test(normalized)) return 'box';
    if (/(ea\b|each)/i.test(normalized)) return 'unit';

    return 'unit';
  };

  // Parse category from description
  const parseCategoryFromDescription = (desc: string): string => {
    const normalized = desc.toLowerCase();

    // Bar Consumables (mixers, juices for cocktails)
    if (/juice.*cold pressed|mixer|tonic|soda water|simple syrup|bitters/.test(normalized)) return 'Bar Consumables';
    if (/(orange|lemon|lime|grapefruit|pineapple).*juice/i.test(normalized)) return 'Bar Consumables';

    // Wine & Spirits
    if (/wine|vodka|gin|rum|whiskey|tequila|beer|liquor|spirit/.test(normalized)) return 'Wine & Spirits';

    // Beverages (non-alcoholic retail)
    if (/soda|water|tea|coffee|energy drink/.test(normalized)) return 'Beverages';

    // Produce
    if (/orange|lemon|lime|grapefruit|apple|banana|lettuce|tomato|onion|pepper|fruit|vegetable/.test(normalized)) return 'Produce';

    // Dairy
    if (/cheese|butter|yogurt|cream|milk/.test(normalized)) return 'Dairy';

    // Meat & Seafood
    if (/chicken|beef|pork|fish|shrimp|salmon|steak|meat|seafood/.test(normalized)) return 'Meat & Seafood';

    // Dry Goods
    if (/flour|sugar|rice|pasta|beans|grain/.test(normalized)) return 'Dry Goods';

    // Packaging
    if (/bag|box|container|cup|lid|straw|napkin|foil|wrap|to-go/.test(normalized)) return 'Packaging';

    return 'Uncategorized';
  };

  // Parse pack size from description (e.g., "10L bib" → "10L Bag-in-Box")
  const parsePackSizeFromDescription = (desc: string): string => {
    const normalized = desc.toLowerCase();

    // Look for size + unit + "bib"
    const bibMatch = normalized.match(/(\d+\s*l)\s*bib/i);
    if (bibMatch) {
      return `${bibMatch[1].toUpperCase()} Bag-in-Box`;
    }

    // Look for just the size
    const sizeMatch = normalized.match(/(\d+\s*(l|liter|gal|gallon|oz|lb))/i);
    if (sizeMatch) {
      return sizeMatch[1].toUpperCase();
    }

    return '';
  };

  // Parse pack quantity (e.g., "10L" → 10)
  const parsePackQuantity = (desc: string): string => {
    const match = desc.match(/(\d+)\s*(l|liter|gal|gallon|oz|lb)/i);
    return match ? match[1] : '';
  };

  const [newItemName, setNewItemName] = useState('');
  const [newItemSKU, setNewItemSKU] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemSubcategory, setNewItemSubcategory] = useState('');
  const [newItemUOM, setNewItemUOM] = useState('');
  const [newItemPackSize, setNewItemPackSize] = useState('');
  const [outerPackQty, setOuterPackQty] = useState('');
  const [innerPackQty, setInnerPackQty] = useState('');
  const [innerPackUom, setInnerPackUom] = useState('');
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [glAccountId, setGlAccountId] = useState<string>('');
  const [glSuggestions, setGlSuggestions] = useState<any[]>([]);

  // AI-powered normalization when Create New Item is opened
  useEffect(() => {
    if (showCreateNew && !newItemName) {
      normalizeWithAI();
    }
  }, [showCreateNew]);

  const normalizeWithAI = async () => {
    setIsNormalizing(true);
    try {
      // Fetch GL account suggestions
      const glResponse = await fetch('/api/items/suggest-gl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: line.description }),
      });

      if (glResponse.ok) {
        const glData = await glResponse.json();
        setGlSuggestions(glData.suggestions || []);
        if (glData.suggestions?.length > 0) {
          setGlAccountId(glData.suggestions[0].id); // Auto-select best match
        }
        setNewItemCategory(glData.suggestedCategory || 'food');
        setNewItemSubcategory(glData.suggestedSubcategory || '');
      }

      // Fetch item normalization
      const response = await fetch('/api/items/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: line.description }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewItemName(data.name || normalizeItemName(line.description));
        setNewItemSKU(data.sku || '');
        setNewItemUOM(data.uom || parseUOMFromDescription(line.description));
        setNewItemPackSize(data.packSize || parsePackSizeFromDescription(line.description));
        setOuterPackQty(data.outerPackQty || '1');
        setInnerPackQty(data.innerPackQty || parsePackQuantity(line.description));
        setInnerPackUom(data.innerPackUom || parseUOMFromDescription(line.description));
      } else {
        // Fallback to regex-based normalization
        setNewItemName(normalizeItemName(line.description));
        setNewItemUOM(parseUOMFromDescription(line.description));
        setNewItemPackSize(parsePackSizeFromDescription(line.description));
      }
    } catch (error) {
      console.error('AI normalization error:', error);
      // Fallback to regex-based normalization
      setNewItemName(normalizeItemName(line.description));
      setNewItemUOM(parseUOMFromDescription(line.description));
      setNewItemPackSize(parsePackSizeFromDescription(line.description));
    } finally {
      setIsNormalizing(false);
    }
  };

  return (
    <Card className="p-4 border-l-4 border-brass">
      <div className="grid grid-cols-12 gap-4">
        {/* Line Item Details */}
        <div className="col-span-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brass/10 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-xs font-semibold text-brass">?</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-1">{line.description}</div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Qty: {line.qty}</span>
                <span>Unit: ${line.unit_cost?.toFixed(2)}</span>
                <span className="font-semibold">Total: ${line.line_total?.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Map */}
        <div className="col-span-6">
          <div className="space-y-3">
            {/* Search Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search for existing item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSearch}
                disabled={isSearching}
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {/* AI Suggestions Header */}
            {suggestions.length > 0 && (
              <div className="flex items-center gap-2 text-xs font-medium text-opsos-sage-700 mb-1">
                <Sparkles className="w-3 h-3 text-brass" />
                <span>AI Suggested Matches</span>
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {suggestions.slice(0, 5).map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors ${
                      selectedItemId === item.id
                        ? 'border-brass bg-brass/10'
                        : 'border-border hover:bg-muted'
                    }`}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        {idx === 0 && (
                          <Badge variant="sage" className="text-xs">Best Match</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                    </div>
                    {selectedItemId === item.id && (
                      <Check className="w-4 h-4 text-brass flex-shrink-0 ml-2" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* No matches found */}
            {!isSearching && suggestions.length === 0 && searchQuery && (
              <div className="p-3 rounded-md bg-orange-50 border border-orange-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-orange-900 mb-1">No matching items found</div>
                    <div className="text-xs text-orange-700">
                      Recommendation: Create a new item for "{line.description}"
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {selectedItemId && (
                <Button
                  size="sm"
                  variant="brass"
                  className="flex-1"
                  onClick={() => handleMapItem(selectedItemId)}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Map to Selected Item
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCreateNew(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Create New Item
              </Button>
            </div>

            {/* Help Text */}
            {suggestions.length > 0 && (
              <div className="text-xs text-muted-foreground italic">
                💡 Tip: Click a suggestion to select it, or search for other items
              </div>
            )}

            {/* Create New Item Form */}
            {showCreateNew && (
              <div className="mt-4 p-4 border-2 border-brass rounded-md bg-brass/5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brass" />
                    Create New Item {isNormalizing && '(AI Processing...)'}
                  </h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowCreateNew(false)}
                  >
                    ×
                  </Button>
                </div>

                {isNormalizing ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-brass border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">AI is normalizing item details...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Item Name *
                    </label>
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      SKU (AI Generated)
                    </label>
                    <input
                      type="text"
                      value={newItemSKU}
                      onChange={(e) => setNewItemSKU(e.target.value)}
                      placeholder="Auto-generated"
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                  </div>

                  {/* Pack Info - Outer/Inner */}
                  <div className="border border-brass/30 rounded-md p-3 bg-brass/5">
                    <div className="text-xs font-semibold text-brass mb-2">Pack Breakdown (for recipes)</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          Outer Pack (Case Qty)
                        </label>
                        <input
                          type="number"
                          value={outerPackQty}
                          onChange={(e) => setOuterPackQty(e.target.value)}
                          placeholder="e.g. 4 (for 4/1 gal)"
                          className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                        />
                        <p className="text-xs text-muted-foreground mt-1">How many units per case</p>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          Inner Pack Size
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={innerPackQty}
                            onChange={(e) => setInnerPackQty(e.target.value)}
                            placeholder="e.g. 1"
                            className="w-20 px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                          />
                          <select
                            value={innerPackUom}
                            onChange={(e) => setInnerPackUom(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                          >
                            <option value="gal">Gallon</option>
                            <option value="L">Liter</option>
                            <option value="mL">Milliliter</option>
                            <option value="lb">Pound</option>
                            <option value="oz">Ounce (fl oz)</option>
                            <option value="g">Gram</option>
                            <option value="kg">Kilogram</option>
                            <option value="qt">Quart</option>
                            <option value="pt">Pint</option>
                            <option value="cup">Cup</option>
                            <option value="tbsp">Tablespoon</option>
                            <option value="tsp">Teaspoon</option>
                            <option value="case">Case</option>
                            <option value="box">Box</option>
                            <option value="bag">Bag</option>
                            <option value="unit">Unit/Each</option>
                          </select>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Size of each individual unit</p>
                      </div>
                    </div>
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                      <strong>Example:</strong> "4/1 GAL" = {outerPackQty || '4'} cases × {innerPackQty || '1'} {innerPackUom || 'gal'} each
                    </div>
                  </div>

                  {/* GL Account Selection */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      GL Account (for accounting) *
                    </label>
                    <select
                      value={glAccountId}
                      onChange={(e) => setGlAccountId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    >
                      <option value="">Select GL Account...</option>
                      {glSuggestions.map((gl) => (
                        <option key={gl.id} value={gl.id}>
                          {gl.external_code ? `${gl.external_code} - ` : ''}{gl.name} ({gl.section})
                          {gl.confidence === 'high' && ' ⭐ Best Match'}
                        </option>
                      ))}
                    </select>
                    {glSuggestions.length > 0 && glSuggestions[0].confidence === 'high' && (
                      <p className="text-xs text-sage mt-1">✓ AI suggested best match selected</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Category
                      </label>
                      <select
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                      >
                        <optgroup label="Alcoholic Beverages">
                          <option value="liquor">Liquor</option>
                          <option value="wine">Wine</option>
                          <option value="beer">Beer</option>
                        </optgroup>
                        <optgroup label="Non-Alcoholic">
                          <option value="non_alcoholic_beverage">Non-Alcoholic Beverage</option>
                        </optgroup>
                        <optgroup label="Food">
                          <option value="produce">Produce</option>
                          <option value="meat">Meat</option>
                          <option value="seafood">Seafood</option>
                          <option value="dairy">Dairy</option>
                          <option value="dry_goods">Dry Goods</option>
                          <option value="frozen">Frozen</option>
                          <option value="food">Food (General)</option>
                        </optgroup>
                        <optgroup label="Supplies">
                          <option value="packaging">Packaging</option>
                          <option value="disposables">Disposables</option>
                          <option value="chemicals">Chemicals / Cleaning</option>
                          <option value="smallwares">Smallwares</option>
                          <option value="supplies">Supplies (General)</option>
                        </optgroup>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Subcategory
                      </label>
                      <input
                        type="text"
                        value={newItemSubcategory}
                        onChange={(e) => setNewItemSubcategory(e.target.value)}
                        placeholder={
                          newItemCategory === 'liquor' ? 'e.g. Tequila, Vodka, Whiskey' :
                          newItemCategory === 'wine' ? 'e.g. Red, White, Sparkling' :
                          newItemCategory === 'beer' ? 'e.g. Lager, IPA, Stout' :
                          'e.g. Specific type'
                        }
                        className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Pack Size
                      </label>
                      <input
                        type="text"
                        value={newItemPackSize}
                        onChange={(e) => setNewItemPackSize(e.target.value)}
                        placeholder="e.g. 10L Bag-in-Box"
                        className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                    💡 <strong>Item Name:</strong> {newItemName}
                    {newItemPackSize && ` (${newItemPackSize})`}
                  </div>

                  <Button
                    className="w-full"
                    variant="brass"
                    onClick={handleCreateAndMap}
                    disabled={!newItemName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create & Map Item
                  </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
