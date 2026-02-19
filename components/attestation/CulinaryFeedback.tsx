'use client';

/**
 * Inline culinary feedback form for attestation stepper.
 * Reads/writes to culinary_shift_logs via /api/culinary/shift-logs.
 * The chef fills this out independently — the manager views it during attestation.
 */

import { useState, useEffect, useCallback } from 'react';
import { Star, Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CulinaryShiftLog } from '@/lib/culinary/types';

interface CulinaryFeedbackProps {
  venueId: string;
  businessDate: string;
  culinaryLog: CulinaryShiftLog | null;
  onUpdate: (log: CulinaryShiftLog) => void;
  disabled?: boolean;
}

export function CulinaryFeedback({
  venueId,
  businessDate,
  culinaryLog,
  onUpdate,
  disabled,
}: CulinaryFeedbackProps) {
  const [saving, setSaving] = useState(false);
  const [localRating, setLocalRating] = useState(culinaryLog?.overall_rating ?? 0);
  const [local86d, setLocal86d] = useState<string[]>(culinaryLog?.eightysixed_items ?? []);
  const [new86dItem, setNew86dItem] = useState('');
  const [localSpecials, setLocalSpecials] = useState(culinaryLog?.specials_notes ?? '');
  const [localEquipment, setLocalEquipment] = useState(culinaryLog?.equipment_issues ?? '');
  const [localPrep, setLocalPrep] = useState(culinaryLog?.prep_notes ?? '');
  const [localWaste, setLocalWaste] = useState(culinaryLog?.waste_notes ?? '');
  const [localVendor, setLocalVendor] = useState(culinaryLog?.vendor_issues ?? '');
  const [localNotes, setLocalNotes] = useState(culinaryLog?.general_notes ?? '');

  // Sync from parent when culinaryLog prop changes
  useEffect(() => {
    setLocalRating(culinaryLog?.overall_rating ?? 0);
    setLocal86d(culinaryLog?.eightysixed_items ?? []);
    setLocalSpecials(culinaryLog?.specials_notes ?? '');
    setLocalEquipment(culinaryLog?.equipment_issues ?? '');
    setLocalPrep(culinaryLog?.prep_notes ?? '');
    setLocalWaste(culinaryLog?.waste_notes ?? '');
    setLocalVendor(culinaryLog?.vendor_issues ?? '');
    setLocalNotes(culinaryLog?.general_notes ?? '');
  }, [culinaryLog]);

  const save = useCallback(
    async (
      overrides: Partial<{
        overall_rating: number;
        eightysixed_items: string[];
        specials_notes: string;
        equipment_issues: string;
        prep_notes: string;
        waste_notes: string;
        vendor_issues: string;
        general_notes: string;
      }>,
    ) => {
      if (disabled) return;
      setSaving(true);

      const payload = {
        id: culinaryLog?.id,
        venue_id: venueId,
        business_date: businessDate,
        overall_rating: overrides.overall_rating ?? localRating,
        eightysixed_items: overrides.eightysixed_items ?? local86d,
        specials_notes: (overrides.specials_notes ?? localSpecials) || null,
        equipment_issues: (overrides.equipment_issues ?? localEquipment) || null,
        prep_notes: (overrides.prep_notes ?? localPrep) || null,
        waste_notes: (overrides.waste_notes ?? localWaste) || null,
        vendor_issues: (overrides.vendor_issues ?? localVendor) || null,
        general_notes: (overrides.general_notes ?? localNotes) || null,
      };

      try {
        const res = await fetch('/api/culinary/shift-logs', {
          method: culinaryLog?.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to save');
        }

        const saved = await res.json();
        onUpdate(saved);
      } catch (err: any) {
        toast.error(err.message || 'Failed to save culinary feedback');
      } finally {
        setSaving(false);
      }
    },
    [
      disabled,
      culinaryLog?.id,
      venueId,
      businessDate,
      localRating,
      local86d,
      localSpecials,
      localEquipment,
      localPrep,
      localWaste,
      localVendor,
      localNotes,
      onUpdate,
    ],
  );

  const handleRating = (rating: number) => {
    setLocalRating(rating);
    save({ overall_rating: rating });
  };

  const handleAdd86d = () => {
    const item = new86dItem.trim();
    if (!item) return;
    const next = [...local86d, item];
    setLocal86d(next);
    setNew86dItem('');
    save({ eightysixed_items: next });
  };

  const handleRemove86d = (index: number) => {
    const next = local86d.filter((_, i) => i !== index);
    setLocal86d(next);
    save({ eightysixed_items: next });
  };

  return (
    <div className="space-y-5">
      {saving && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving...
        </div>
      )}

      {/* Overall Rating */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Overall Kitchen Rating *</label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={disabled}
              onClick={() => handleRating(star)}
              className={`p-1.5 rounded-md transition-colors ${
                localRating >= star
                  ? 'text-yellow-500 bg-yellow-50'
                  : 'text-gray-300 hover:text-yellow-400 hover:bg-yellow-50/50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Star className="h-5 w-5 fill-current" />
            </button>
          ))}
        </div>
      </div>

      {/* 86'd Items */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">86'd Items</label>
        {local86d.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {local86d.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-error/10 text-error rounded"
              >
                {item}
                {!disabled && (
                  <button type="button" onClick={() => handleRemove86d(i)} className="hover:text-error/80">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {!disabled && (
          <div className="flex gap-2">
            <Input
              placeholder="Add item that was 86'd..."
              value={new86dItem}
              onChange={(e) => setNew86dItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd86d())}
              className="text-sm flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd86d}
              disabled={!new86dItem.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Specials Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Specials Performance</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="How did tonight's specials perform?"
          rows={2}
          value={localSpecials}
          onChange={(e) => setLocalSpecials(e.target.value)}
          onBlur={() => save({ specials_notes: localSpecials })}
          disabled={disabled}
        />
      </div>

      {/* Equipment Issues */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Equipment Issues</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Any equipment problems tonight?"
          rows={2}
          value={localEquipment}
          onChange={(e) => setLocalEquipment(e.target.value)}
          onBlur={() => save({ equipment_issues: localEquipment })}
          disabled={disabled}
        />
      </div>

      {/* Prep Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Prep Notes (for next service)</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Prep priorities or notes for tomorrow..."
          rows={2}
          value={localPrep}
          onChange={(e) => setLocalPrep(e.target.value)}
          onBlur={() => save({ prep_notes: localPrep })}
          disabled={disabled}
        />
      </div>

      {/* Waste Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Waste / Spoilage</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Any notable waste or spoilage tonight?"
          rows={2}
          value={localWaste}
          onChange={(e) => setLocalWaste(e.target.value)}
          onBlur={() => save({ waste_notes: localWaste })}
          disabled={disabled}
        />
      </div>

      {/* Vendor Issues */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Vendor Issues</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Any vendor delivery issues or shortages?"
          rows={2}
          value={localVendor}
          onChange={(e) => setLocalVendor(e.target.value)}
          onBlur={() => save({ vendor_issues: localVendor })}
          disabled={disabled}
        />
      </div>

      {/* General Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">General Kitchen Notes</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Any other observations about tonight's kitchen operations..."
          rows={3}
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={() => save({ general_notes: localNotes })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
