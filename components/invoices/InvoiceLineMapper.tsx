'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Check, Sparkles } from 'lucide-react';
import { PackConfigurationManager, PackConfig } from './PackConfigurationManager';

interface InvoiceLineMapperProps {
  line: {
    id: string;
    description: string;
    qty: number;
    unit_cost: number;
    line_total: number;
  };
  vendorId: string;
  vendorName?: string;
}

export function InvoiceLineMapper({ line, vendorId, vendorName }: InvoiceLineMapperProps) {
  const [searchQuery, setSearchQuery] = useState(line.description);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedItemPackConfigs, setSelectedItemPackConfigs] = useState<PackConfig[]>([]);
  const [showPackConfigEditor, setShowPackConfigEditor] = useState(false);
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
      console.log('Mapping line', line.id, 'to item', itemId);
      const response = await fetch(`/api/invoice-lines/${line.id}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      });

      const data = await response.json();
      console.log('Mapping response:', response.status, data);

      if (!response.ok) {
        console.error('Mapping failed:', data);
        alert(`Failed to map item: ${data.error || data.message || 'Unknown error'}`);
        return;
      }

      console.log('Mapping successful, reloading...');
      window.location.reload(); // Refresh to show updated mapping
    } catch (error) {
      console.error('Map error:', error);
      alert(`Error mapping item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Create new item and map to it
  const handleCreateAndMap = async () => {
    if (!newItemName.trim()) return;

    try {
      const fullItemName = newItemName;

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
          item_type: 'beverage', // Set to beverage since we're processing beverage invoices
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        console.error('Failed to create item:', errorData);
        alert(`Failed to create item: ${errorData.error || errorData.details || 'Unknown error'}`);
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

    // Check for beverages FIRST (before case/unit checks)
    // Recipe unit for beverages is always 'oz' regardless of how they're sold (case, bottle, etc.)
    if (/(liquor|wine|beer|vodka|gin|rum|whiskey|tequila|bourbon|bitters|vermouth|liqueur|spirit|aperitif)/i.test(normalized)) {
      return 'oz';
    }

    // Check for specific size patterns
    if (/(\d+\s*(l|lt)\b|liter)/i.test(normalized)) return 'L';
    if (/(\d+\s*gal\b|gallon)/i.test(normalized)) return 'gal';
    if (/(\d+\s*qt\b|quart)/i.test(normalized)) return 'qt';
    if (/(\d+\s*pt\b|pint)/i.test(normalized)) return 'pt';
    if (/(\d+\s*oz\b|ounce)/i.test(normalized)) return 'oz';
    if (/(\d+\s*lb\b|pound)/i.test(normalized)) return 'lb';

    // Generic pack types (only for non-beverages)
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
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [glAccountId, setGlAccountId] = useState<string>('');
  const [glSuggestions, setGlSuggestions] = useState<any[]>([]);
  const [allGlAccounts, setAllGlAccounts] = useState<any[]>([]);
  const [mappingUnit, setMappingUnit] = useState<'as_invoiced' | 'case' | 'bottle'>('as_invoiced');
  const [mappedQty, setMappedQty] = useState<number>(line.qty);
  const [packSizeNumber, setPackSizeNumber] = useState<number | null>(null);
  const [showPackConfigs, setShowPackConfigs] = useState(false);

  // Pack configurations - array of different ways to purchase this item
  const [packConfigs, setPackConfigs] = useState<Array<{
    pack_type: string;
    units_per_pack: number;
    unit_size: number;
    unit_size_uom: string;
  }>>([]);

  // Parse pack size from description on mount (e.g., "6/Cs" → 6)
  useEffect(() => {
    const match = line.description.match(/(\d+)\s*\/\s*(cs|case|pk|pack)/i);
    if (match) {
      setPackSizeNumber(parseInt(match[1], 10));
    }
  }, [line.description]);

  // Update mapped quantity when unit changes
  useEffect(() => {
    if (mappingUnit === 'as_invoiced') {
      setMappedQty(line.qty);
    } else if (mappingUnit === 'case' && packSizeNumber) {
      // Convert bottles to cases (e.g., 3 bottles ÷ 6 per case = 0.5 cases)
      setMappedQty(line.qty / packSizeNumber);
    } else if (mappingUnit === 'bottle' && packSizeNumber) {
      // Convert cases to bottles (e.g., 3 cases × 6 per case = 18 bottles)
      setMappedQty(line.qty * packSizeNumber);
    }
  }, [mappingUnit, line.qty, packSizeNumber]);

  // AI-powered normalization when Create New Item is opened
  useEffect(() => {
    if (showCreateNew && !newItemName) {
      normalizeWithAI();
    }
  }, [showCreateNew]);

  const [packConfigSource, setPackConfigSource] = useState<'parsed' | 'learned' | 'web_search' | null>(null);
  const [packConfigBrand, setPackConfigBrand] = useState<string | null>(null);
  const [packConfigSampleCount, setPackConfigSampleCount] = useState<number>(0);

  const normalizeWithAI = async () => {
    setIsNormalizing(true);
    try {
      // Fetch ALL GL accounts first (fallback)
      const allGlResponse = await fetch('/api/gl-accounts');
      if (allGlResponse.ok) {
        const allGlData = await allGlResponse.json();
        setAllGlAccounts(allGlData.accounts || []);
      }

      // Fetch GL account suggestions
      const glResponse = await fetch('/api/items/suggest-gl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: line.description }),
      });

      if (glResponse.ok) {
        const glData = await glResponse.json();
        console.log('GL suggestions:', glData);
        setGlSuggestions(glData.suggestions || []);
        if (glData.suggestions?.length > 0) {
          setGlAccountId(glData.suggestions[0].id); // Auto-select best match
          console.log('Auto-selected GL account:', glData.suggestions[0]);
        } else {
          console.warn('No GL suggestions found');
        }
        setNewItemCategory(glData.suggestedCategory || 'food');
        setNewItemSubcategory(glData.suggestedSubcategory || '');
        console.log('Suggested category:', glData.suggestedCategory, 'subcategory:', glData.suggestedSubcategory);
      } else {
        console.error('GL suggestion API failed:', await glResponse.text());
      }

      // Learn pack configuration from existing items (brand-based learning + web search)
      const learnResponse = await fetch('/api/items/learn-pack-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: line.description, vendor_name: vendorName }),
      });

      let learnedPackConfig = null;
      if (learnResponse.ok) {
        const learnData = await learnResponse.json();
        console.log('Pack config learning response:', learnData);

        // Prioritize learned config over web search
        if (learnData.learned) {
          learnedPackConfig = learnData.learned;
          setPackConfigSource('learned');
          setPackConfigBrand(learnData.brand);
          setPackConfigSampleCount(learnData.learned.sample_count);
          console.log(`✓ Learned pack config from ${learnData.learned.sample_count} existing ${learnData.brand} items`);
        } else if (learnData.web_search) {
          learnedPackConfig = learnData.web_search;
          setPackConfigSource('web_search');
          setPackConfigBrand(learnData.brand);
          console.log('✓ Found pack config via web search');
        }
      } else {
        console.error('Pack config learning API failed:', await learnResponse.text());
      }

      // Fetch item normalization
      const response = await fetch('/api/items/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: line.description }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('AI normalization response:', data);
        const parsedUOM = parseUOMFromDescription(line.description);
        console.log('Parsed UOM from description:', parsedUOM);

        // Prefer parsed UOM over AI UOM for beverages (AI often returns 'unit' incorrectly)
        const isBeverage = /(liquor|wine|beer|vodka|gin|rum|whiskey|tequila|bourbon|bitters|vermouth|liqueur|spirit|aperitif)/i.test(line.description);
        const finalUOM = isBeverage ? parsedUOM : (data.uom || parsedUOM);
        console.log('Final UOM:', finalUOM, '(beverage override:', isBeverage, ')');

        setNewItemName(data.name || normalizeItemName(line.description));
        setNewItemSKU(data.sku || '');
        setNewItemUOM(finalUOM);

        // Parse pack configuration - prioritize learned > parsed > default
        console.log('Parsing pack config from:', line.description);

        let parsedPackConfig = null;

        // Pattern 1: "6/750mL" = 6 bottles per case, 750mL each
        const casePackMatch = line.description.match(/(\d+)\s*\/\s*(\d+\.?\d*)\s*(ml|l|oz|lb|gal|qt|pt|kg|g|cs)/i);
        if (casePackMatch) {
          const unitsPerPack = parseInt(casePackMatch[1]);
          const unitSize = parseFloat(casePackMatch[2]);
          const unitSizeUom = casePackMatch[3].toLowerCase();

          console.log('Pattern 1 matched (case pack):', casePackMatch[0], '→', unitsPerPack, 'units @', unitSize, unitSizeUom);
          parsedPackConfig = {
            pack_type: unitSizeUom === 'cs' ? 'case' : 'case',
            units_per_pack: unitsPerPack,
            unit_size: unitSize,
            unit_size_uom: unitSizeUom === 'cs' ? 'ml' : unitSizeUom
          };
          setPackConfigSource('parsed');
        } else {
          // Pattern 2: "750ML" (single bottle size, no case pack)
          const bottleMatch = line.description.match(/(\d+\.?\d*)\s*(ml|l|oz|lb|gal|qt|pt|kg|g)\b/i);
          if (bottleMatch) {
            const unitSize = parseFloat(bottleMatch[1]);
            const unitSizeUom = bottleMatch[2].toLowerCase();

            console.log('Pattern 2 matched (bottle):', bottleMatch[0], '→ 1 bottle @', unitSize, unitSizeUom);
            parsedPackConfig = {
              pack_type: 'bottle',
              units_per_pack: 1,
              unit_size: unitSize,
              unit_size_uom: unitSizeUom
            };
            setPackConfigSource('parsed');
          } else {
            // Pattern 3: Common beverage defaults (no size found)
            const isBeverage = /(liquor|wine|beer|vodka|gin|rum|whiskey|tequila|bourbon|bitters|vermouth|liqueur|spirit|aperitif)/i.test(line.description);
            console.log('No size pattern matched. Is beverage?', isBeverage);
            if (isBeverage) {
              console.log('Defaulting to 750mL bottle');
              parsedPackConfig = {
                pack_type: 'bottle',
                units_per_pack: 1,
                unit_size: 750,
                unit_size_uom: 'ml'
              };
              setPackConfigSource('parsed');
            }
          }
        }

        // Use learned config if available and confident, otherwise use parsed
        if (learnedPackConfig && (!parsedPackConfig || learnedPackConfig.confidence === 'high')) {
          console.log('Using learned pack config:', learnedPackConfig);
          setPackConfigs([{
            pack_type: learnedPackConfig.pack_type,
            units_per_pack: learnedPackConfig.units_per_pack,
            unit_size: learnedPackConfig.unit_size,
            unit_size_uom: learnedPackConfig.unit_size_uom
          }]);
          // packConfigSource already set above
        } else if (parsedPackConfig) {
          console.log('Using parsed pack config:', parsedPackConfig);
          setPackConfigs([parsedPackConfig]);
        }
      } else {
        // Fallback to regex-based normalization
        setNewItemName(normalizeItemName(line.description));
        setNewItemUOM(parseUOMFromDescription(line.description));

        // Also try pack config parsing in fallback
        const bottleMatch = line.description.match(/(\d+\.?\d*)\s*(ml|l|oz|lb|gal|qt|pt|kg|g)\b/i);
        if (bottleMatch) {
          setPackConfigs([{
            pack_type: 'bottle',
            units_per_pack: 1,
            unit_size: parseFloat(bottleMatch[1]),
            unit_size_uom: bottleMatch[2].toLowerCase()
          }]);
        } else {
          const isBeverage = /(liquor|wine|beer|vodka|gin|rum|whiskey|tequila|bourbon|bitters|vermouth|liqueur|spirit|aperitif)/i.test(line.description);
          if (isBeverage) {
            setPackConfigs([{
              pack_type: 'bottle',
              units_per_pack: 1,
              unit_size: 750,
              unit_size_uom: 'ml'
            }]);
          }
        }
      }
    } catch (error) {
      console.error('AI normalization error:', error);
      // Fallback to regex-based normalization
      setNewItemName(normalizeItemName(line.description));
      setNewItemUOM(parseUOMFromDescription(line.description));

      // Pack config fallback
      const bottleMatch = line.description.match(/(\d+\.?\d*)\s*(ml|l|oz|lb|gal|qt|pt|kg|g)\b/i);
      if (bottleMatch) {
        setPackConfigs([{
          pack_type: 'bottle',
          units_per_pack: 1,
          unit_size: parseFloat(bottleMatch[1]),
          unit_size_uom: bottleMatch[2].toLowerCase()
        }]);
      } else {
        const isBeverage = /(liquor|wine|beer|vodka|gin|rum|whiskey|tequila|bourbon|bitters|vermouth|liqueur|spirit|aperitif)/i.test(line.description);
        if (isBeverage) {
          setPackConfigs([{
            pack_type: 'bottle',
            units_per_pack: 1,
            unit_size: 750,
            unit_size_uom: 'ml'
          }]);
        }
      }
    } finally {
      setIsNormalizing(false);
    }
  };

  return (
    <Card className="p-4 border-l-4 border-brass">
      {/* Invoice Context - Always Visible */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <div className="text-xs font-semibold text-blue-900 mb-2">📄 Invoice Line (OCR Extracted):</div>
        <div className="space-y-1 text-xs">
          <div><span className="font-medium text-blue-800">Description:</span> <span className="font-mono text-blue-900">{line.description}</span></div>
          {vendorName && <div><span className="font-medium text-blue-800">Vendor:</span> {vendorName}</div>}
          <div className="flex gap-4">
            <div><span className="font-medium text-blue-800">Qty:</span> {line.qty}</div>
            <div><span className="font-medium text-blue-800">Unit Cost:</span> ${line.unit_cost?.toFixed(2)}</div>
            <div><span className="font-medium text-blue-800">Total:</span> <span className="font-semibold">${line.line_total?.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

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
                    onClick={async () => {
                      setSelectedItemId(item.id);
                      setSelectedItem(item);
                      // Fetch full item details including pack configurations
                      try {
                        const response = await fetch(`/api/items/${item.id}`);
                        const data = await response.json();
                        if (data.item?.pack_configurations) {
                          setSelectedItemPackConfigs(data.item.pack_configurations);
                        }
                      } catch (error) {
                        console.error('Error fetching item details:', error);
                      }
                    }}
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

            {/* Selected Item Pack Configuration Editor */}
            {selectedItemId && selectedItem && (
              <div className="mt-4 p-4 border-2 border-blue-300 rounded-md bg-blue-50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm text-blue-900">
                    Selected: {selectedItem.name}
                  </h4>
                  <button
                    onClick={() => {
                      setSelectedItemId(null);
                      setSelectedItem(null);
                      setSelectedItemPackConfigs([]);
                      setShowPackConfigEditor(false);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    ×
                  </button>
                </div>

                <div className="text-xs text-blue-700 mb-3">
                  SKU: {selectedItem.sku} • Base UOM: {selectedItem.base_uom}
                </div>

                {/* Existing Pack Configurations */}
                {selectedItemPackConfigs.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-blue-900 mb-2">Existing Pack Sizes:</div>
                    <div className="space-y-1">
                      {selectedItemPackConfigs.map((pack: any, idx: number) => (
                        <div key={idx} className="text-xs text-blue-800 bg-white p-2 rounded border border-blue-200">
                          {pack.pack_type}: {pack.units_per_pack} × {pack.unit_size} {pack.unit_size_uom}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add New Pack Configuration */}
                {!showPackConfigEditor && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPackConfigEditor(true)}
                    className="w-full mb-3"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add New Pack Size (e.g., 750ml)
                  </Button>
                )}

                {showPackConfigEditor && (
                  <div className="mb-3 p-3 border border-blue-300 rounded bg-white">
                    <div className="text-xs font-semibold text-blue-900 mb-2">Add New Pack Configuration:</div>
                    <PackConfigurationManager
                      baseUom={selectedItem.base_uom}
                      packConfigs={selectedItemPackConfigs}
                      onChange={setSelectedItemPackConfigs}
                    />
                  </div>
                )}

                {/* Map Button */}
                <Button
                  size="sm"
                  variant="brass"
                  className="w-full"
                  onClick={async () => {
                    // Save pack configurations if modified
                    if (showPackConfigEditor && selectedItemPackConfigs.length > 0) {
                      try {
                        const response = await fetch(`/api/items/${selectedItemId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            item_pack_configurations: selectedItemPackConfigs
                          })
                        });

                        if (!response.ok) {
                          console.error('Failed to update pack configurations');
                          alert('Failed to save pack configurations');
                          return;
                        }
                      } catch (error) {
                        console.error('Error updating pack configurations:', error);
                        alert('Error saving pack configurations');
                        return;
                      }
                    }
                    // Map the invoice line
                    await handleMapItem(selectedItemId);
                  }}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {showPackConfigEditor ? 'Save Pack Size & Map Item' : 'Map to This Item'}
                </Button>
              </div>
            )}

            {/* Mapping Unit Selection */}
            {packSizeNumber && (
              <div className="p-3 border border-orange-200 bg-orange-50 rounded-md">
                <div className="text-xs font-semibold text-orange-900 mb-2">
                  ⚠️ Pack Size Detected: {packSizeNumber}/Cs
                </div>
                <div className="text-xs text-orange-700 mb-2">
                  OCR shows qty={line.qty}. Is this {line.qty} cases or {line.qty} bottles?
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMappingUnit('as_invoiced')}
                    className={`flex-1 px-3 py-2 text-xs rounded-md border ${
                      mappingUnit === 'as_invoiced'
                        ? 'bg-brass text-white border-brass'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    As Invoiced ({line.qty})
                  </button>
                  <button
                    onClick={() => setMappingUnit('case')}
                    className={`flex-1 px-3 py-2 text-xs rounded-md border ${
                      mappingUnit === 'case'
                        ? 'bg-brass text-white border-brass'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {line.qty} Cases = {(line.qty * packSizeNumber).toFixed(1)} Btl
                  </button>
                  <button
                    onClick={() => setMappingUnit('bottle')}
                    className={`flex-1 px-3 py-2 text-xs rounded-md border ${
                      mappingUnit === 'bottle'
                        ? 'bg-brass text-white border-brass'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {line.qty} Btl = {(line.qty / packSizeNumber).toFixed(2)} Cases
                  </button>
                </div>
                <div className="mt-2 text-xs text-orange-700">
                  <strong>Mapping as:</strong> {mappedQty} {mappingUnit === 'case' ? 'cases' : mappingUnit === 'bottle' ? 'bottles' : 'units'}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!selectedItemId && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCreateNew(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Create New Item
                </Button>
              </div>
            )}

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

                {/* Invoice Context - Always Visible */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="text-xs font-semibold text-blue-900 mb-2">📄 Invoice Line Details:</div>
                  <div className="space-y-1 text-xs">
                    <div><span className="font-medium text-blue-800">Description:</span> <span className="font-mono text-blue-900">{line.description}</span></div>
                    {vendorName && <div><span className="font-medium text-blue-800">Vendor:</span> {vendorName}</div>}
                    <div className="flex gap-4">
                      <div><span className="font-medium text-blue-800">Qty:</span> {line.qty}</div>
                      <div><span className="font-medium text-blue-800">Unit Cost:</span> ${line.unit_cost?.toFixed(2)}</div>
                      <div><span className="font-medium text-blue-800">Total:</span> <span className="font-semibold">${line.line_total?.toFixed(2)}</span></div>
                    </div>
                  </div>
                </div>

                {isNormalizing ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-brass border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">AI is normalizing item details...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                      Item Name * {newItemName && <span className="text-sage">✓ Auto-filled</span>}
                    </label>
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                      placeholder="Normalized item name"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                      SKU {newItemSKU && <span className="text-sage">✓ AI Generated</span>}
                    </label>
                    <input
                      type="text"
                      value={newItemSKU}
                      onChange={(e) => setNewItemSKU(e.target.value)}
                      placeholder="Auto-generated on save"
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                  </div>

                  {/* Recipe Unit (base_uom) - ALWAYS VISIBLE */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                      Recipe Unit (How recipes measure this) * {newItemUOM && <span className="text-sage">✓ Auto-detected</span>}
                    </label>
                    <select
                      value={newItemUOM}
                      onChange={(e) => setNewItemUOM(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    >
                      <optgroup label="Common Units">
                        <option value="unit">Each/Bottle/Piece</option>
                        <option value="oz">Ounce (fl oz)</option>
                        <option value="lb">Pound</option>
                        <option value="gal">Gallon</option>
                      </optgroup>
                      <optgroup label="Metric Volume">
                        <option value="mL">Milliliter</option>
                        <option value="L">Liter</option>
                      </optgroup>
                      <optgroup label="Metric Weight">
                        <option value="g">Gram</option>
                        <option value="kg">Kilogram</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="qt">Quart</option>
                        <option value="pt">Pint</option>
                        <option value="cup">Cup</option>
                        <option value="case">Case</option>
                      </optgroup>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 This is the unit recipes will use. Pack configurations below will convert to this unit.
                    </p>
                  </div>

                  {/* Pack Configuration Source Indicator */}
                  {packConfigSource && (
                    <div className={`mb-2 p-2 rounded-md text-xs ${
                      packConfigSource === 'learned'
                        ? 'bg-sage-50 border border-sage-200 text-sage-900'
                        : packConfigSource === 'web_search'
                        ? 'bg-blue-50 border border-blue-200 text-blue-900'
                        : 'bg-gray-50 border border-gray-200 text-gray-900'
                    }`}>
                      {packConfigSource === 'learned' && (
                        <>
                          <span className="font-semibold">✓ Learned from your data:</span> Based on {packConfigSampleCount} existing {packConfigBrand} item{packConfigSampleCount !== 1 ? 's' : ''}
                        </>
                      )}
                      {packConfigSource === 'web_search' && (
                        <>
                          <span className="font-semibold">🌐 Found via web search:</span> {packConfigBrand ? `${packConfigBrand} ` : ''}pack size from product specs
                        </>
                      )}
                      {packConfigSource === 'parsed' && (
                        <>
                          <span className="font-semibold">📄 Parsed from invoice:</span> Extracted from "{line.description}"
                        </>
                      )}
                    </div>
                  )}

                  {/* Pack Configurations - Collapsible */}
                  <PackConfigurationManager
                    baseUom={newItemUOM}
                    packConfigs={packConfigs}
                    onChange={setPackConfigs}
                  />

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
                      {/* AI Suggestions First */}
                      {glSuggestions.length > 0 && (
                        <optgroup label="🤖 AI Suggested">
                          {glSuggestions.map((gl) => (
                            <option key={gl.id} value={gl.id}>
                              {gl.external_code ? `${gl.external_code} - ` : ''}{gl.name} ({gl.section})
                              {gl.confidence === 'high' && ' ⭐ Best Match'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {/* All Other GL Accounts */}
                      {allGlAccounts.length > 0 && (
                        <optgroup label="All GL Accounts">
                          {allGlAccounts
                            .filter(gl => !glSuggestions.find(s => s.id === gl.id))
                            .map((gl) => (
                              <option key={gl.id} value={gl.id}>
                                {gl.external_code ? `${gl.external_code} - ` : ''}{gl.name} ({gl.section})
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                    {glSuggestions.length > 0 && glSuggestions[0]?.confidence === 'high' && (
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

                  <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                    💡 <strong>Item Name:</strong> {newItemName}
                  </div>

                  <Button
                    className="w-full"
                    variant="brass"
                    onClick={handleCreateAndMap}
                    disabled={!newItemName.trim() || !glAccountId}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create & Map Item
                  </Button>
                  {!glAccountId && newItemName.trim() && (
                    <p className="text-xs text-red-600 mt-1">⚠️ GL Account is required</p>
                  )}
                  </div>
                )}
              </div>
            )}
      </div>
    </Card>
  );
}
