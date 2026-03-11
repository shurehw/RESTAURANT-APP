'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableShape } from './TableShape';
import type { VenueTable, VenueSection } from '@/lib/database/floor-plan';

interface TableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: VenueTable | null; // null = create mode
  sections: VenueSection[];
  onSave: (data: {
    table_number: string;
    min_capacity: number;
    max_capacity: number;
    shape: string;
    section_id: string | null;
  }) => void;
  onDelete?: (id: string) => void;
}

const SHAPE_OPTIONS: { value: VenueTable['shape']; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'square', label: 'Square' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'booth', label: 'Booth' },
  { value: 'half_circle', label: 'Half-Circle Booth' },
  { value: 'pullman', label: 'Pullman Booth' },
  { value: 'bar_seat', label: 'Bar Seat' },
];

export function TableDialog({
  open,
  onOpenChange,
  table,
  sections,
  onSave,
  onDelete,
}: TableDialogProps) {
  const [tableNumber, setTableNumber] = useState('');
  const [minCapacity, setMinCapacity] = useState(1);
  const [maxCapacity, setMaxCapacity] = useState(4);
  const [shape, setShape] = useState<VenueTable['shape']>('round');
  const [sectionId, setSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (table) {
      setTableNumber(table.table_number);
      setMinCapacity(table.min_capacity || 1);
      setMaxCapacity(table.max_capacity);
      setShape(table.shape);
      setSectionId(table.section_id);
    } else {
      setTableNumber('');
      setMinCapacity(1);
      setMaxCapacity(4);
      setShape('round');
      setSectionId(null);
    }
  }, [table, open]);

  const handleSave = () => {
    if (!tableNumber.trim()) return;
    const min = Math.max(1, Math.min(minCapacity, maxCapacity));
    onSave({
      table_number: tableNumber.trim(),
      min_capacity: min,
      max_capacity: maxCapacity,
      shape,
      section_id: sectionId,
    });
    onOpenChange(false);
  };

  const selectedSection = sections.find((s) => s.id === sectionId);
  const previewColor = selectedSection?.color || '#6B7280';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{table ? 'Edit Table' : 'Add Table'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="table-number">Table Number</Label>
            <Input
              id="table-number"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. 1, A1, B3"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="min-capacity">Min Guests</Label>
              <Input
                id="min-capacity"
                type="number"
                min={1}
                max={maxCapacity}
                value={minCapacity}
                onChange={(e) => setMinCapacity(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="max-capacity">Max Guests</Label>
              <Input
                id="max-capacity"
                type="number"
                min={minCapacity}
                max={30}
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="shape">Shape</Label>
            <select
              id="shape"
              value={shape}
              onChange={(e) => setShape(e.target.value as VenueTable['shape'])}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              {SHAPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Shape preview */}
          <div className="flex justify-center">
            <div
              className="bg-[#1a1a2e] rounded-lg p-3"
              style={{ width: 80, height: 80 }}
            >
              <TableShape
                shape={shape}
                capacity={maxCapacity}
                minCapacity={minCapacity}
                sectionColor={previewColor}
                tableNumber={tableNumber || '#'}
                isSelected={false}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="section">Section</Label>
            <select
              id="section"
              value={sectionId || ''}
              onChange={(e) => setSectionId(e.target.value || null)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">No section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {table && onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete(table.id);
                onOpenChange(false);
              }}
            >
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!tableNumber.trim()}
              className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
            >
              {table ? 'Save' : 'Add'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
