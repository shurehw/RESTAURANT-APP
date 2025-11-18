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
      // Create the new item
      const createResponse = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemName,
          sku: newItemSKU || `AUTO-${Date.now()}`,
          category: newItemCategory || 'uncategorized',
          base_uom: newItemUOM || 'unit',
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

  const [newItemName, setNewItemName] = useState(line.description);
  const [newItemSKU, setNewItemSKU] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemUOM, setNewItemUOM] = useState('unit');

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
                  <h4 className="font-semibold text-sm">Create New Item</h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowCreateNew(false)}
                  >
                    ×
                  </Button>
                </div>

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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        SKU
                      </label>
                      <input
                        type="text"
                        value={newItemSKU}
                        onChange={(e) => setNewItemSKU(e.target.value)}
                        placeholder="Auto-generated"
                        className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        UOM
                      </label>
                      <select
                        value={newItemUOM}
                        onChange={(e) => setNewItemUOM(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                      >
                        <option value="unit">Unit</option>
                        <option value="lb">Pound (lb)</option>
                        <option value="oz">Ounce (oz)</option>
                        <option value="gal">Gallon (gal)</option>
                        <option value="qt">Quart (qt)</option>
                        <option value="pt">Pint (pt)</option>
                        <option value="L">Liter (L)</option>
                        <option value="case">Case</option>
                        <option value="box">Box</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                      placeholder="e.g. Beverages, Produce"
                      className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
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
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
