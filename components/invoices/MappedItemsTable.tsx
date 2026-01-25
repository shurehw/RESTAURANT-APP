'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface MappedItemsTableProps {
  lines: Array<{
    id: string;
    description: string;
    qty: number;
    unit_cost: number;
    line_total: number;
    item_id: string | null;
    item?: {
      id: string;
      name: string;
      sku: string;
    };
  }>;
}

export function MappedItemsTable({ lines }: MappedItemsTableProps) {
  const router = useRouter();
  const [unmapping, setUnmapping] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [batchUnmapping, setBatchUnmapping] = useState(false);

  const handleUnmap = async (lineId: string) => {
    if (!confirm('Are you sure you want to unmap this item?')) return;

    setUnmapping(lineId);
    try {
      const response = await fetch(`/api/invoice-lines/${lineId}/unmap`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        alert(`Failed to unmap item: ${data.error || 'Unknown error'}`);
        return;
      }

      router.refresh();
    } catch (error) {
      console.error('Unmap error:', error);
      alert('Error unmapping item');
    } finally {
      setUnmapping(null);
    }
  };

  const handleBatchUnmap = async () => {
    if (selectedLines.size === 0) return;
    if (!confirm(`Are you sure you want to unmap ${selectedLines.size} item(s)?`)) return;

    setBatchUnmapping(true);
    try {
      const promises = Array.from(selectedLines).map(lineId =>
        fetch(`/api/invoice-lines/${lineId}/unmap`, { method: 'POST' })
      );

      const results = await Promise.all(promises);
      const failures = results.filter(r => !r.ok);

      if (failures.length > 0) {
        alert(`Failed to unmap ${failures.length} item(s)`);
      }

      setSelectedLines(new Set());
      router.refresh();
    } catch (error) {
      console.error('Batch unmap error:', error);
      alert('Error unmapping items');
    } finally {
      setBatchUnmapping(false);
    }
  };

  const toggleSelection = (lineId: string) => {
    const newSelection = new Set(selectedLines);
    if (newSelection.has(lineId)) {
      newSelection.delete(lineId);
    } else {
      newSelection.add(lineId);
    }
    setSelectedLines(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedLines.size === lines.length) {
      setSelectedLines(new Set());
    } else {
      setSelectedLines(new Set(lines.map(l => l.id)));
    }
  };

  if (lines.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No items have been mapped yet
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {selectedLines.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded">
          <span className="text-sm font-medium text-orange-900">
            {selectedLines.size} item(s) selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBatchUnmap}
            disabled={batchUnmapping}
          >
            <X className="w-4 h-4 mr-1" />
            Unmap Selected
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted border-b-2 border-brass">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedLines.size === lines.length && lines.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-brass"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold">Mapped To</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Unit Price</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Total</th>
              <th className="px-4 py-3 text-right text-xs font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.id}
                className={`border-b border-border hover:bg-muted/50 ${
                  selectedLines.has(line.id) ? 'bg-brass/10' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedLines.has(line.id)}
                    onChange={() => toggleSelection(line.id)}
                    className="rounded border-brass"
                  />
                </td>
                <td className="px-4 py-3 text-sm">{line.description}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="sage" className="text-xs">
                      {line.item?.name || "—"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {line.item?.sku}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono">{line.qty}</td>
                <td className="px-4 py-3 text-right text-sm font-mono">
                  ${line.unit_cost?.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono font-medium">
                  ${line.line_total?.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnmap(line.id)}
                    disabled={unmapping === line.id}
                    className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
