'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Check, Sparkles, FileText } from 'lucide-react';
import { PackConfigurationManager, PackConfig } from './PackConfigurationManager';
import { InvoicePDFViewer } from './InvoicePDFViewer';

interface InvoiceLineMapperProps {
  line: {
    id: string;
    description: string;
    qty: number;
    unit_cost: number;
    line_total: number;
    catch_weight?: number;
    piece_count?: number;
    nominal_case_weight?: number;
    product_specs?: Record<string, any>;
    invoice?: {
      id: string;
      invoice_number?: string;
      storage_path?: string;
    };
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
  const [isIgnoring, setIsIgnoring] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showPDFViewer, setShowPDFViewer] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('[InvoiceLineMapper] Line data:', {
      lineId: line.id,
      description: line.description?.substring(0, 40),
      hasInvoice: !!line.invoice,
      invoiceId: line.invoice?.id,
      invoiceNumber: line.invoice?.invoice_number,
      storagePath: line.invoice?.storage_path,
    });
  }, []);

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

  const handleIgnoreLine = async () => {
    setIsIgnoring(true);
    try {
      const response = await fetch(`/api/invoice-lines/${line.id}/ignore`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(`Failed to ignore line: ${data?.error || data?.message || `HTTP ${response.status}`}`);
        return;
      }
      window.location.reload();
    } catch (e) {
      alert(`Failed to ignore line: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsIgnoring(false);
    }
  };

  // Create new item and map to it
  const handleCreateAndMap = async () => {
    if (!newItemName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const fullItemName = newItemName;
      const categoryForCreate = (newItemCategory || inferItemCategory(line.description) || 'food').toLowerCase();
      const itemTypeForCreate =
        ['beverage', 'liquor', 'wine', 'beer', 'spirits', 'non_alcoholic_beverage', 'bar_consumable'].includes(categoryForCreate)
          ? 'beverage'
          : ['packaging', 'supplies', 'disposables', 'chemicals', 'smallwares'].includes(categoryForCreate)
          ? 'other'
          : 'food';

      // Create the new item
      const createResponse = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullItemName,
          sku: newItemSKU || `AUTO-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          category: categoryForCreate,
          subcategory: newItemSubcategory || null,
          base_uom: newItemUOM || 'unit',
          gl_account_id: glAccountId || null,
          item_type: itemTypeForCreate,
          pack_configurations: packConfigs.length > 0 ? packConfigs : null,
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
    } finally {
      setIsCreating(false);
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

  /**
   * Infer OpsOS item category enum from description.
   * IMPORTANT: items.category is an enum (food/liquor/wine/beer/etc). If we default to "food"
   * for wine/spirits, the UI will look wrong and GL mapping gets messier.
   */
  const inferItemCategory = (desc: string): string => {
    const n = (desc || '').toLowerCase();
    const v = (vendorName || '').toLowerCase();

    // Strong vendor signals
    const beverageVendors = /(r?ndc|republic national|glazer|southern glazer|spec'?s|johnson brothers)/i;
    const produceVendors = /(produce|farms|fresh)/i;
    const meatVendors = /(meat|brothers|provision|seafood)/i;

    // Packaging / supplies
    if (/(napkin|straw|lid|cup|container|foil|wrap|to-go|glove|detergent|soap|sanitizer|bleach|chemical|trash bag|garbage bag)/i.test(n)) {
      if (/(detergent|soap|sanitizer|bleach|chemical)/i.test(n)) return 'chemicals';
      if (/(napkin|straw|lid|cup|container|foil|wrap|to-go)/i.test(n)) return 'disposables';
      return 'packaging';
    }

    // Bar consumables / mixers
    if (/(mixer|tonic|soda water|simple syrup|bitters)\b/.test(n)) return 'bar_consumable';
    if (/(orange|lemon|lime|grapefruit|pineapple|cranberry|apple).*juice\b/.test(n)) return 'bar_consumable';

    // Wine (incl champagne/sparkling + Spanish/Italian regions and varietals)
    if (/(champagne|prosecco|cava|sparkling|brut)\b/.test(n)) return 'wine';
    if (/\bwine\b/.test(n)) return 'wine';
    if (/(ribera|rioja|chianti|barolo|brunello|bordeaux|burgundy|cabernet|chardonnay|pinot|merlot|sauvignon|tempranillo|sangiovese|nebbiolo|grenache)\b/.test(n)) return 'wine';

    // Beer
    if (/(beer|ipa|lager|stout|pilsner|ale)\b/.test(n)) return 'beer';

    // Liquor / spirits
    if (/(vodka|gin|rum|whiskey|whisky|tequila|bourbon|scotch|cognac|brandy|liqueur|vermouth|aperitif|amaro|mezcal|spirit)\b/.test(n)) {
      return 'liquor';
    }

    // Non-alcoholic beverage
    if (/(soda|water|tea|coffee|energy drink|kombucha)\b/.test(n)) return 'non_alcoholic_beverage';

    // Vendor-based beverage fallback
    if (beverageVendors.test(v)) return 'liquor';

    // Food subcategories
    if (/(shrimp|salmon|tuna|fish|oyster|seafood|crab|lobster|scallop)/i.test(n) || /seafood/i.test(v)) return 'seafood';
    if (/(beef|pork|chicken|lamb|steak|meat|sausage|bacon|turkey)/i.test(n) || meatVendors.test(v)) return 'meat';
    if (/(milk|cream|butter|cheese|yogurt|egg|eggs|dairy)/i.test(n)) return 'dairy';
    if (/(lettuce|tomato|onion|pepper|cucumber|avocado|apple|banana|orange|lemon|lime|grapefruit|produce|fruit|vegetable|berries|strawberry|blueberry|raspberry)/i.test(n) || produceVendors.test(v)) return 'produce';
    if (/(rice|pasta|flour|sugar|beans|grain|spice|salt|peppercorn|oil|vinegar|sauce|canned|dry goods|pantry)/i.test(n)) return 'dry_goods';
    if (/(frozen|ice cream|fries|frozen)/i.test(n)) return 'frozen';

    return 'food';
  };

  const inferItemSubcategory = (desc: string, category: string): string => {
    const n = (desc || '').toLowerCase();
    if (category === 'wine') {
      if (/(champagne|sparkling|prosecco|cava|brut)\b/.test(n)) return 'sparkling';
      if (/\bred\b/.test(n)) return 'red';
      if (/\bwhite\b/.test(n)) return 'white';
      if (/\brose\b|\br osé\b/.test(n)) return 'rose';
      return '';
    }
    if (category === 'liquor') {
      if (/\bvodka\b/.test(n)) return 'vodka';
      if (/\bg in\b|\bgin\b/.test(n)) return 'gin';
      if (/\brum\b/.test(n)) return 'rum';
      if (/\btequila\b|\bmezcal\b/.test(n)) return 'tequila';
      if (/\bwhiskey\b|\bwhisky\b|\bbourbon\b|\bscotch\b/.test(n)) return 'whiskey';
      if (/\bvermouth\b/.test(n)) return 'vermouth';
      if (/\baperitif\b|\baperitif\b|\baperitivo\b/.test(n)) return 'aperitif';
      return '';
    }
    if (category === 'beer') {
      if (/\bipa\b/.test(n)) return 'ipa';
      if (/\blager\b/.test(n)) return 'lager';
      if (/\bstout\b/.test(n)) return 'stout';
      return '';
    }
    return '';
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

  const getDetectedPackLabel = (desc: string): string | null => {
    const d = (desc || '').toLowerCase();

    const normalizeUomForLabel = (uom: string) => {
      const u = uom.toLowerCase();
      if (u === 'ml') return 'mL';
      if (u === 'l' || u === 'lt' || u === 'ltr') return 'L';
      if (u === 'oz') return 'oz';
      if (u === 'lb') return 'lb';
      if (u === 'gal') return 'gal';
      if (u === 'qt') return 'qt';
      if (u === 'pt') return 'pt';
      if (u === 'kg') return 'kg';
      if (u === 'g') return 'g';
      return uom;
    };

    // Common wine/spirits format: "12x750ml" / "12 × 750 ml"
    const caseXSize = d.match(/\b(\d+)\s*(x|×)\s*(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
    if (caseXSize) {
      const units = Number(caseXSize[1]);
      const size = Number(caseXSize[3]);
      const uom = normalizeUomForLabel(caseXSize[5]);
      if (Number.isFinite(units) && units > 0 && Number.isFinite(size) && size > 0) {
        return `${units} × ${size} ${uom}`;
      }
    }

    // Case notation variants: "CS/12 750ml", "12/CS 750ml", "12 CS 750ml"
    const size = d.match(/\b(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
    const csCount =
      d.match(/\bcs\s*\/\s*(\d+)\b/i) ||
      d.match(/\b(\d+)\s*\/\s*cs\b/i) ||
      d.match(/\b(\d+)\s*cs\b/i);

    if (csCount && size) {
      const units = Number(csCount[1]);
      const unitSize = Number(size[1]);
      const uom = normalizeUomForLabel(size[3]);
      if (Number.isFinite(units) && units > 0 && Number.isFinite(unitSize) && unitSize > 0) {
        return `${units} × ${unitSize} ${uom}`;
      }
    }

    // Single-unit size: "750ml"
    if (size) {
      const unitSize = Number(size[1]);
      const uom = normalizeUomForLabel(size[3]);
      if (Number.isFinite(unitSize) && unitSize > 0) {
        return `${unitSize} ${uom}`;
      }
    }

    return null;
  };

  const suggestPackConfigFromInvoiceLine = (): PackConfig => {
    const d = (line.description || '').toLowerCase();

    const normalizeUom = (uom: string) => {
      const u = uom.toLowerCase();
      if (u === 'ml') return 'mL';
      if (u === 'l' || u === 'lt' || u === 'ltr') return 'L';
      if (u === 'gal') return 'gal';
      if (u === 'qt') return 'qt';
      if (u === 'pt') return 'pt';
      if (u === 'oz') return 'oz';
      if (u === 'lb') return 'lb';
      return uom;
    };

    const caseXSize = d.match(/\b(\d+)\s*(x|×)\s*(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt)\b/i);
    if (caseXSize) {
      const units = Number(caseXSize[1]);
      const unitSize = Number(caseXSize[3]);
      return {
        pack_type: 'case',
        units_per_pack: Number.isFinite(units) && units > 0 ? units : 1,
        unit_size: Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
        unit_size_uom: normalizeUom(caseXSize[5]),
      };
    }

    const size = d.match(/\b(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt)\b/i);
    const csCount =
      d.match(/\bcs\s*\/\s*(\d+)\b/i) ||
      d.match(/\b(\d+)\s*\/\s*cs\b/i) ||
      d.match(/\b(\d+)\s*cs\b/i);

    if (csCount && size) {
      const units = Number(csCount[1]);
      const unitSize = Number(size[1]);
      return {
        pack_type: 'case',
        units_per_pack: Number.isFinite(units) && units > 0 ? units : 1,
        unit_size: Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
        unit_size_uom: normalizeUom(size[3]),
      };
    }

    if (size) {
      const unitSize = Number(size[1]);
      const uom = normalizeUom(size[3]);
      // Determine pack type based on UOM - items sold by weight use 'each', liquids use 'bottle'
      let packType = 'bottle';
      if (uom === 'lb' || uom === 'kg' || uom === 'g') {
        packType = 'each';
      }
      return {
        pack_type: packType,
        units_per_pack: 1,
        unit_size: Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
        unit_size_uom: uom,
      };
    }

    return {
      pack_type: 'case',
      units_per_pack: 1,
      unit_size: 1,
      unit_size_uom: 'unit',
    };
  };

  const normalizeWithAI = async () => {
    setIsNormalizing(true);
    try {
      // Run all API calls in parallel for speed
      const [allGlResponse, glResponse, learnResponse, response] = await Promise.all([
        fetch('/api/gl-accounts'),
        fetch('/api/items/suggest-gl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: line.description }),
        }),
        fetch('/api/items/learn-pack-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: line.description, vendor_name: vendorName }),
        }),
        fetch('/api/items/normalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: line.description }),
        }),
      ]);

      // Process GL accounts
      if (allGlResponse.ok) {
        const allGlData = await allGlResponse.json();
        setAllGlAccounts(allGlData.accounts || []);
      }

      // Process GL suggestions
      if (glResponse.ok) {
        const glData = await glResponse.json();
        setGlSuggestions(glData.suggestions || []);
        if (glData.suggestions?.length > 0) {
          setGlAccountId(glData.suggestions[0].id);
        }
        const inferredCategory = inferItemCategory(line.description);
        const categoryFromApi = glData.suggestedCategory || 'food';
        const finalCategory = inferredCategory !== 'food' ? inferredCategory : categoryFromApi;
        setNewItemCategory(finalCategory);
        const inferredSub = inferItemSubcategory(line.description, finalCategory);
        setNewItemSubcategory(inferredSub || glData.suggestedSubcategory || '');
      }

      // Process pack config learning
      let learnedPackConfig = null;
      if (learnResponse.ok) {
        const learnData = await learnResponse.json();
        if (learnData.learned) {
          learnedPackConfig = learnData.learned;
          setPackConfigSource('learned');
          setPackConfigBrand(learnData.brand);
          setPackConfigSampleCount(learnData.learned.sample_count);
        } else if (learnData.web_search) {
          learnedPackConfig = learnData.web_search;
          setPackConfigSource('web_search');
          setPackConfigBrand(learnData.brand);
        }
      }

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

        // Pattern 1: "12x750ml" or "12 × 750 ml" = 12 bottles per case, 750ml each
        const caseXSizeMatch = line.description.match(/(\d+)\s*(x|×)\s*(\d+\.?\d*)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
        if (caseXSizeMatch) {
          const unitsPerPack = parseInt(caseXSizeMatch[1]);
          const unitSize = parseFloat(caseXSizeMatch[3]);
          const unitSizeUom = caseXSizeMatch[4].toLowerCase();
          console.log('Pattern 1 matched (case × size):', caseXSizeMatch[0], '→', unitsPerPack, 'units @', unitSize, unitSizeUom);
          parsedPackConfig = {
            pack_type: 'case',
            units_per_pack: unitsPerPack,
            unit_size: unitSize,
            unit_size_uom: unitSizeUom
          };
          setPackConfigSource('parsed');
        }
        // Pattern 2: "12 PC/CS" or "12/CS" = 12 pieces per case
        else if (line.description.match(/(\d+)\s*(?:pc|piece|ea|each)?\s*\/\s*(?:cs|case|box)\b/i)) {
          const foodCaseMatch = line.description.match(/(\d+)\s*(?:pc|piece|ea|each)?\s*\/\s*(?:cs|case|box)\b/i);
          const unitsPerPack = parseInt(foodCaseMatch![1]);
          console.log('Pattern 2 matched (food case):', foodCaseMatch![0], '→', unitsPerPack, 'pieces per case');
          parsedPackConfig = {
            pack_type: 'case',
            units_per_pack: unitsPerPack,
            unit_size: 1,
            unit_size_uom: 'each'
          };
          setPackConfigSource('parsed');
        }
        // Pattern 3: "6/750mL" = 6 bottles per case, 750mL each
        else {
          const casePackMatch = line.description.match(/(\d+)\s*\/\s*(\d+\.?\d*)\s*(ml|l|oz|lb|gal|qt|pt|kg|g|cs)/i);
          if (casePackMatch) {
            const unitsPerPack = parseInt(casePackMatch[1]);
            const unitSize = parseFloat(casePackMatch[2]);
            const unitSizeUom = casePackMatch[3].toLowerCase();

            console.log('Pattern 3 matched (slash beverage case):', casePackMatch[0], '→', unitsPerPack, 'units @', unitSize, unitSizeUom);
            parsedPackConfig = {
              pack_type: unitSizeUom === 'cs' ? 'case' : 'case',
              units_per_pack: unitsPerPack,
              unit_size: unitSize,
              unit_size_uom: unitSizeUom === 'cs' ? 'ml' : unitSizeUom
            };
            setPackConfigSource('parsed');
          }
          // Pattern 3: "1 LB", "5 lb", "10 LB" = sold by pound
          // For catch-weight items (meat, seafood), use generic 1 lb pack, not the specific weight
          else if (/(\d+\.?\d*)\s*lb\b/i.test(line.description)) {
            const lbMatch = line.description.match(/(\d+\.?\d*)\s*lb/i);
            const lbs = lbMatch ? parseFloat(lbMatch[1]) : 1;

            // Check if this is a catch-weight item (variable weight protein/seafood)
            const isCatchWeight = /(beef|pork|chicken|turkey|lamb|duck|veal|salmon|tuna|cod|halibut|shrimp|lobster|crab|scallop|seabass|fish|meat|protein)/i.test(line.description);

            console.log('Pound pattern matched:', lbs, 'lb', '(catch-weight:', isCatchWeight, ')');
            parsedPackConfig = {
              pack_type: 'each',
              units_per_pack: 1,
              unit_size: isCatchWeight ? 1 : lbs, // Use generic 1 lb for catch-weight, actual weight for fixed items
              unit_size_uom: 'lb'
            };
            setPackConfigSource('parsed');
          }
          // Pattern 4: "EA" or "EACH" = sold as individual pieces
          else if (/\b(ea|each)\b/i.test(line.description)) {
            console.log('Each pattern matched');
            parsedPackConfig = {
              pack_type: 'each',
              units_per_pack: 1,
              unit_size: 1,
              unit_size_uom: 'each'
            };
            setPackConfigSource('parsed');
          }
          // Pattern 5: "750ML" (single bottle size, no case pack)
          else {
            const bottleMatch = line.description.match(/(\d+\.?\d*)\s*(ml|l|oz|lb|gal|qt|pt|kg|g)\b/i);
            if (bottleMatch) {
              const unitSize = parseFloat(bottleMatch[1]);
              const unitSizeUom = bottleMatch[2].toLowerCase();

              // Determine pack type based on UOM - items sold by weight use 'each', liquids use 'bottle'
              let packType = 'bottle';
              if (unitSizeUom === 'lb' || unitSizeUom === 'kg' || unitSizeUom === 'g') {
                packType = 'each';
              }

              console.log('Pattern 5 matched (single unit):', bottleMatch[0], '→ 1 each @', unitSize, unitSizeUom, 'pack type:', packType);
              parsedPackConfig = {
                pack_type: packType,
                units_per_pack: 1,
                unit_size: unitSize,
                unit_size_uom: unitSizeUom
              };
              setPackConfigSource('parsed');
            }
            // Pattern 6: Common beverage defaults (no size found)
            else {
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
          const unitSizeUom = bottleMatch[2].toLowerCase();
          const packType = (unitSizeUom === 'lb' || unitSizeUom === 'kg' || unitSizeUom === 'g') ? 'each' : 'bottle';
          setPackConfigs([{
            pack_type: packType,
            units_per_pack: 1,
            unit_size: parseFloat(bottleMatch[1]),
            unit_size_uom: unitSizeUom
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
        const unitSizeUom = bottleMatch[2].toLowerCase();
        const packType = (unitSizeUom === 'lb' || unitSizeUom === 'kg' || unitSizeUom === 'g') ? 'each' : 'bottle';
        setPackConfigs([{
          pack_type: packType,
          units_per_pack: 1,
          unit_size: parseFloat(bottleMatch[1]),
          unit_size_uom: unitSizeUom
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

  const detectedPackLabel = getDetectedPackLabel(line.description);

  return (
    <Card className="p-4 border-l-4 border-brass">
      {/* Invoice Context - Always Visible */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-blue-900">
            📄 Invoice Line (OCR Extracted):
            <span className="ml-2 text-red-600 font-mono text-[10px]">
              [DEBUG: invoice={String(!!line.invoice)}, path={String(!!line.invoice?.storage_path)}]
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPDFViewer(true)}
            className="text-xs h-7"
            disabled={!line.invoice?.storage_path}
          >
            <FileText className="w-3 h-3 mr-1" />
            {line.invoice?.storage_path ? 'View Invoice' : 'No PDF'}
          </Button>
        </div>
        <div className="space-y-1 text-xs">
          <div><span className="font-medium text-blue-800">Description:</span> <span className="font-mono text-blue-900">{line.description}</span></div>
          {detectedPackLabel && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-white border-blue-300 text-blue-900">
                Pack: {detectedPackLabel}
              </Badge>
            </div>
          )}
          {vendorName && <div><span className="font-medium text-blue-800">Vendor:</span> {vendorName}</div>}
          <div className="flex gap-4">
            <div><span className="font-medium text-blue-800">Qty:</span> {line.qty}</div>
            <div><span className="font-medium text-blue-800">Unit Cost:</span> ${line.unit_cost?.toFixed(2)}</div>
            <div><span className="font-medium text-blue-800">Total:</span> <span className="font-semibold">${line.line_total?.toFixed(2)}</span></div>
          </div>
          {/* Product Specifications */}
          {(line.catch_weight || line.piece_count || line.nominal_case_weight || line.product_specs) && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
              <div className="font-semibold text-green-900 mb-1">📦 Product Specs (OCR Extracted):</div>
              <div className="flex flex-wrap gap-2">
                {line.catch_weight && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900">
                    Catch Weight: {line.catch_weight} lb
                  </Badge>
                )}
                {line.piece_count && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900">
                    {line.piece_count} PC
                  </Badge>
                )}
                {line.nominal_case_weight && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900">
                    Nominal: {line.nominal_case_weight}#
                  </Badge>
                )}
                {line.product_specs?.species && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900">
                    {line.product_specs.species}
                  </Badge>
                )}
                {line.product_specs?.cut && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900">
                    {line.product_specs.cut}
                  </Badge>
                )}
                {line.product_specs?.trim && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900" title={line.product_specs.trim_full}>
                    {line.product_specs.trim}
                  </Badge>
                )}
                {line.product_specs?.grade && (
                  <Badge variant="outline" className="bg-white border-green-300 text-green-900">
                    {line.product_specs.grade}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {line.qty === 0 && (
                  <span className="text-orange-700">
                    This line has qty 0 (likely a total/header). You can ignore it.
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleIgnoreLine}
                disabled={isIgnoring}
                className="text-muted-foreground"
              >
                Ignore
              </Button>
            </div>
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
                    onClick={() => {
                      setShowPackConfigEditor(true);
                      setSelectedItemPackConfigs((prev) => {
                        if (prev && prev.length > 0) return prev;
                        return [suggestPackConfigFromInvoiceLine()];
                      });
                    }}
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
                          let details = '';
                          try {
                            const contentType = response.headers.get('content-type') || '';
                            if (contentType.includes('application/json')) {
                              const err = await response.json();
                              details = err?.details || err?.error || err?.message || JSON.stringify(err);
                            } else {
                              details = await response.text();
                            }
                          } catch {
                            // ignore
                          }
                          console.error('Failed to update pack configurations', response.status, details);
                          alert(`Failed to save pack configurations: ${details || `HTTP ${response.status}`}`);
                          return;
                        }
                      } catch (error) {
                        console.error('Error updating pack configurations:', error);
                        alert(`Error saving pack configurations: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                    {detectedPackLabel && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-white border-blue-300 text-blue-900">
                          Pack: {detectedPackLabel}
                        </Badge>
                      </div>
                    )}
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
                    {glSuggestions.length === 0 && allGlAccounts.length === 0 && !isNormalizing && (
                      <p className="text-xs text-orange-600 mt-1">⚠️ GL accounts failed to load. Check console for errors.</p>
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
                          <option value="bar_consumable">Bar Consumable</option>
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
                        Subcategory {newItemSubcategory && <span className="text-sage">✓ Auto-detected</span>}
                      </label>
                      {newItemCategory === 'food' ? (
                        <select
                          value={newItemSubcategory}
                          onChange={(e) => setNewItemSubcategory(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                        >
                          <option value="">Select subcategory...</option>
                          <option value="meat_protein">Meat & Protein</option>
                          <option value="seafood">Seafood</option>
                          <option value="produce">Produce</option>
                          <option value="dairy">Dairy & Eggs</option>
                          <option value="dry_goods">Dry Goods & Pantry</option>
                          <option value="bakery">Bakery</option>
                          <option value="specialty">Specialty & Gourmet</option>
                        </select>
                      ) : (
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
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                    💡 <strong>Item Name:</strong> {newItemName}
                  </div>

                  <Button
                    className="w-full"
                    variant="brass"
                    onClick={handleCreateAndMap}
                    disabled={!newItemName.trim() || !glAccountId || isCreating}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    {isCreating ? 'Creating...' : 'Create & Map Item'}
                  </Button>
                  {!glAccountId && newItemName.trim() && (
                    <p className="text-xs text-red-600 mt-1">⚠️ GL Account is required</p>
                  )}
                  </div>
                )}
              </div>
            )}
      </div>

      {/* PDF Viewer Modal */}
      {showPDFViewer && line.invoice?.storage_path && (
        <InvoicePDFViewer
          invoiceId={line.invoice.id}
          invoiceNumber={line.invoice.invoice_number}
          storagePath={line.invoice.storage_path}
          searchText={line.description}
          onClose={() => setShowPDFViewer(false)}
        />
      )}
    </Card>
  );
}
