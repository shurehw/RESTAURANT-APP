'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ItemDetailsModal } from './ItemDetailsModal';

interface Item {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory: string;
  base_uom: string;
  created_at: string;
  item_pack_configurations?: PackConfig[];
}

interface PackConfig {
  pack_type: string;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
}

interface ItemsTableProps {
  items: Item[];
  onUpdate?: () => void;
}

export function ItemsTable({ items, onUpdate }: ItemsTableProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openItem = (itemId: string) => {
    setSelectedItemId(itemId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedItemId(null);
  };

  return (
    <>
      <div className="border border-opsos-sage-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-opsos-sage-50">
            <tr className="border-b border-opsos-sage-200">
              <th className="text-left p-3 font-semibold">Item Name</th>
              <th className="text-left p-3 font-semibold">Category</th>
              <th className="text-left p-3 font-semibold">Unit</th>
              <th className="text-left p-3 font-semibold">Case Size</th>
              <th className="text-left p-3 font-semibold">Par Level</th>
              <th className="text-left p-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {items && items.length > 0 ? (
              items.map((item) => {
                const configs = (item as any).item_pack_configurations || [];
                const caseConfig = configs.find((c: PackConfig) => c.pack_type === 'case');

                return (
                  <tr
                    key={item.id}
                    onClick={() => openItem(item.id)}
                    className="border-b border-opsos-sage-100 hover:bg-opsos-sage-50/50 cursor-pointer transition-colors"
                  >
                    <td className="p-3">
                      <div className="font-medium text-ledger-black">{item.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {item.subcategory || item.category}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">
                      {item.base_uom || '—'}
                    </td>
                    <td className="p-3">
                      {caseConfig ? (
                        <span className="px-2 py-0.5 bg-brass/10 text-brass rounded text-xs font-mono">
                          {caseConfig.units_per_pack > 1
                            ? `${caseConfig.units_per_pack} × ${caseConfig.unit_size}${caseConfig.unit_size_uom}`
                            : `${caseConfig.unit_size}${caseConfig.unit_size_uom}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">—</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs text-sage">
                        Active
                      </Badge>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No items yet. Use bulk import above to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ItemDetailsModal
        itemId={selectedItemId}
        isOpen={isModalOpen}
        onClose={closeModal}
        onUpdate={onUpdate}
      />
    </>
  );
}
