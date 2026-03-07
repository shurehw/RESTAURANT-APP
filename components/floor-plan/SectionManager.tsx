'use client';

import { useState } from 'react';
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
import { Pencil, Trash2, Plus } from 'lucide-react';
import type { VenueSection } from '@/lib/database/floor-plan';

const SECTION_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

interface SectionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: VenueSection[];
  srSeatingAreas: string[];
  onSave: (section: {
    id?: string;
    name: string;
    color: string;
    sr_seating_area: string | null;
    sort_order: number;
  }) => void;
  onDelete: (id: string) => void;
}

export function SectionManager({
  open,
  onOpenChange,
  sections,
  srSeatingAreas,
  onSave,
  onDelete,
}: SectionManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SECTION_COLORS[0]);
  const [srArea, setSrArea] = useState<string | null>(null);

  const startEdit = (section: VenueSection) => {
    setEditingId(section.id);
    setName(section.name);
    setColor(section.color);
    setSrArea(section.sr_seating_area);
  };

  const startCreate = () => {
    setEditingId(null);
    setName('');
    setColor(SECTION_COLORS[sections.length % SECTION_COLORS.length]);
    setSrArea(null);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...(editingId ? { id: editingId } : {}),
      name: name.trim(),
      color,
      sr_seating_area: srArea,
      sort_order: editingId
        ? sections.find((s) => s.id === editingId)?.sort_order ?? 0
        : sections.length,
    });
    setEditingId(null);
    setName('');
  };

  const isEditing = editingId !== null || name.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Sections</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Existing sections list */}
          {sections.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md border bg-gray-50"
            >
              <div
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
                {s.sr_seating_area && (
                  <span className="text-[10px] text-gray-400 ml-2">
                    SR: {s.sr_seating_area}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete section "${s.name}"?`)) onDelete(s.id);
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </Button>
            </div>
          ))}

          {/* Add/Edit form */}
          {isEditing ? (
            <div className="border rounded-md p-3 space-y-3 bg-white">
              <div>
                <Label>Section Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Main Floor, Patio, Bar"
                />
              </div>

              <div>
                <Label>Color</Label>
                <div className="flex gap-2 mt-1">
                  {SECTION_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        color === c ? 'border-gray-800 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>

              {srSeatingAreas.length > 0 && (
                <div>
                  <Label>SevenRooms Seating Area</Label>
                  <select
                    value={srArea || ''}
                    onChange={(e) => setSrArea(e.target.value || null)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="">None</option>
                    {srSeatingAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(null);
                    setName('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
                >
                  {editingId ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={startCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Section
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
