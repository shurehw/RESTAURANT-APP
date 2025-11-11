'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Save, ArrowLeft, Plus, Trash2 } from 'lucide-react';

interface CountLine {
  id: string;
  itemId?: string;
  itemName: string;
  sku: string;
  category: string;
  quantity: number;
  uom: string;
  unitCost: number;
  lineTotal: number;
}

export function InventoryCountForm() {
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [countType, setCountType] = useState<'full' | 'partial' | 'spot_check'>('full');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showItemSearch, setShowItemSearch] = useState(false);

  const totalValue = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const totalItems = lines.length;

  const handleAddLine = (item: any) => {
    const newLine: CountLine = {
      id: Math.random().toString(),
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      category: item.category || 'uncategorized',
      quantity: 0,
      uom: item.base_uom || 'ea',
      unitCost: 0,
      lineTotal: 0,
    };
    setLines([...lines, newLine]);
    setShowItemSearch(false);
    setSearchQuery('');
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    setLines(lines.map(line =>
      line.id === id
        ? { ...line, quantity, lineTotal: quantity * line.unitCost }
        : line
    ));
  };

  const handleUpdateCost = (id: string, unitCost: number) => {
    setLines(lines.map(line =>
      line.id === id
        ? { ...line, unitCost, lineTotal: line.quantity * unitCost }
        : line
    ));
  };

  const handleRemoveLine = (id: string) => {
    setLines(lines.filter(line => line.id !== id));
  };

  const handleSave = async () => {
    // TODO: Implement save to API
    console.log('Saving count:', {
      count_date: countDate,
      count_type: countType,
      lines,
    });
  };

  return (
    <div className="space-y-6">
      {/* Count Header */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Count Details</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Count Date</label>
            <input
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
              className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Count Type</label>
            <select
              value={countType}
              onChange={(e) => setCountType(e.target.value as any)}
              className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
            >
              <option value="full">Full Count (End of Month)</option>
              <option value="partial">Partial Count (Category/Area)</option>
              <option value="spot_check">Spot Check (Random)</option>
            </select>
          </div>

          <div className="flex items-end">
            <div className="w-full p-3 bg-opsos-sage-50 border border-opsos-sage-200 rounded-md">
              <div className="text-xs text-muted-foreground mb-1">Total Value</div>
              <div className="font-mono font-bold text-lg">${totalValue.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Count Lines */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Items Counted ({totalItems})</h3>
          <Button
            size="sm"
            variant="brass"
            onClick={() => setShowItemSearch(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </Button>
        </div>

        {lines.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            No items counted yet
            <br />
            <span className="text-xs">Click &quot;Add Item&quot; to start counting</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-sm text-muted-foreground border-b">
                <tr>
                  <th className="pb-3 font-medium">Item</th>
                  <th className="pb-3 font-medium">SKU</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium w-32">Quantity</th>
                  <th className="pb-3 font-medium">UOM</th>
                  <th className="pb-3 font-medium w-32">Unit Cost</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {lines.map((line) => (
                  <tr key={line.id} className="border-b">
                    <td className="py-3">{line.itemName}</td>
                    <td className="py-3 text-muted-foreground">{line.sku}</td>
                    <td className="py-3">
                      <Badge variant="outline">{line.category}</Badge>
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => handleUpdateQuantity(line.id, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-opsos-sage-300 rounded-md text-right font-mono"
                      />
                    </td>
                    <td className="py-3 text-muted-foreground">{line.uom}</td>
                    <td className="py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) => handleUpdateCost(line.id, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-opsos-sage-300 rounded-md text-right font-mono"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-3 text-right font-mono">
                      ${line.lineTotal.toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveLine(line.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <td colSpan={6} className="py-3 text-right">Total Value:</td>
                  <td className="py-3 text-right font-mono text-lg">${totalValue.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <a href="/inventory/counts">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Cancel
          </a>
        </Button>
        <Button
          variant="brass"
          onClick={handleSave}
          disabled={lines.length === 0}
        >
          <Save className="w-4 h-4 mr-2" />
          Save Count
        </Button>
      </div>

      {/* Item Search Modal */}
      {showItemSearch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="font-semibold mb-4">Search Items</h3>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or SKU..."
                  className="w-full pl-10 pr-4 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                  autoFocus
                />
              </div>
            </div>

            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Item search coming soon...</p>
              <p className="text-xs mt-2">Search for items by name or SKU</p>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setShowItemSearch(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
