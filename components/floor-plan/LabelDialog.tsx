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
import type { VenueLabel } from '@/lib/database/floor-plan';

interface LabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: VenueLabel | null; // null = create mode
  onSave: (data: { text: string; font_size: number; color: string }) => void;
  onDelete?: (id: string) => void;
}

const SIZE_OPTIONS = [
  { value: 10, label: 'Small' },
  { value: 14, label: 'Medium' },
  { value: 18, label: 'Large' },
  { value: 24, label: 'Extra Large' },
];

const COLOR_OPTIONS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#9CA3AF', label: 'Gray' },
  { value: '#F59E0B', label: 'Gold' },
  { value: '#EF4444', label: 'Red' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#10B981', label: 'Green' },
];

export function LabelDialog({
  open,
  onOpenChange,
  label,
  onSave,
  onDelete,
}: LabelDialogProps) {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [color, setColor] = useState('#FFFFFF');

  useEffect(() => {
    if (label) {
      setText(label.text);
      setFontSize(label.font_size);
      setColor(label.color);
    } else {
      setText('');
      setFontSize(14);
      setColor('#FFFFFF');
    }
  }, [label, open]);

  const handleSave = () => {
    if (!text.trim()) return;
    onSave({ text: text.trim(), font_size: fontSize, color });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{label ? 'Edit Label' : 'Add Label'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="label-text">Text</Label>
            <Input
              id="label-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. BAR, FIREPLACE, DJ"
            />
          </div>

          <div>
            <Label htmlFor="label-size">Size</Label>
            <select
              id="label-size"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              {SIZE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  className={`w-8 h-8 rounded-full border-2 ${
                    color === c.value ? 'border-opsos-brass-500 ring-2 ring-opsos-brass-300' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-center min-h-[60px]">
            <span
              className="font-bold uppercase tracking-widest"
              style={{
                fontSize: `${fontSize}px`,
                color,
                textShadow: '0 1px 4px rgba(0,0,0,0.6)',
              }}
            >
              {text || 'PREVIEW'}
            </span>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {label && onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete(label.id);
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
              disabled={!text.trim()}
              className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
            >
              {label ? 'Save' : 'Add'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
