'use client';

/**
 * Inline entertainment feedback form for attestation stepper.
 * Reads/writes to entertainment_shift_logs via /api/entertainment/shift-logs.
 */

import { useState, useEffect, useCallback } from 'react';
import { Star, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { ShiftLog, CrowdEnergy, EntertainmentType } from '@/lib/entertainment/types';

interface EntertainmentFeedbackProps {
  venueId: string;
  businessDate: string;
  shiftLog: ShiftLog | null;
  onUpdate: (log: ShiftLog) => void;
  disabled?: boolean;
}

const CROWD_ENERGY_OPTIONS: { value: CrowdEnergy; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'exceptional', label: 'Exceptional' },
];

const ENTERTAINMENT_TYPES: EntertainmentType[] = ['Band', 'Dancers', 'DJ', 'AV'];

export function EntertainmentFeedback({
  venueId,
  businessDate,
  shiftLog,
  onUpdate,
  disabled,
}: EntertainmentFeedbackProps) {
  const [saving, setSaving] = useState(false);
  const [localRating, setLocalRating] = useState(shiftLog?.overall_rating ?? 0);
  const [localEnergy, setLocalEnergy] = useState<CrowdEnergy | ''>(shiftLog?.crowd_energy ?? '');
  const [localRebook, setLocalRebook] = useState<boolean | null>(shiftLog?.would_rebook ?? null);
  const [localTypeFeedback, setLocalTypeFeedback] = useState<Record<string, { rating?: number; notes?: string }>>(
    shiftLog?.type_feedback ?? {},
  );
  const [localFeedback, setLocalFeedback] = useState(shiftLog?.entertainment_feedback ?? '');

  // Sync from parent when shiftLog prop changes
  useEffect(() => {
    setLocalRating(shiftLog?.overall_rating ?? 0);
    setLocalEnergy(shiftLog?.crowd_energy ?? '');
    setLocalRebook(shiftLog?.would_rebook ?? null);
    setLocalTypeFeedback(shiftLog?.type_feedback ?? {});
    setLocalFeedback(shiftLog?.entertainment_feedback ?? '');
  }, [shiftLog]);

  const save = useCallback(async (overrides: Partial<{
    overall_rating: number;
    crowd_energy: CrowdEnergy | '';
    would_rebook: boolean | null;
    type_feedback: Record<string, { rating?: number; notes?: string }>;
    entertainment_feedback: string;
  }>) => {
    if (disabled) return;
    setSaving(true);

    const payload = {
      id: shiftLog?.id,
      venue_id: venueId,
      business_date: businessDate,
      overall_rating: overrides.overall_rating ?? localRating,
      crowd_energy: (overrides.crowd_energy ?? localEnergy) || null,
      would_rebook: overrides.would_rebook ?? localRebook,
      type_feedback: overrides.type_feedback ?? localTypeFeedback,
      entertainment_feedback: (overrides.entertainment_feedback ?? localFeedback) || null,
    };

    try {
      const res = await fetch('/api/entertainment/shift-logs', {
        method: shiftLog?.id ? 'PUT' : 'POST',
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
      toast.error(err.message || 'Failed to save entertainment feedback');
    } finally {
      setSaving(false);
    }
  }, [disabled, shiftLog?.id, venueId, businessDate, localRating, localEnergy, localRebook, localTypeFeedback, localFeedback, onUpdate]);

  const handleRating = (rating: number) => {
    setLocalRating(rating);
    save({ overall_rating: rating });
  };

  const handleEnergy = (value: CrowdEnergy) => {
    setLocalEnergy(value);
    save({ crowd_energy: value });
  };

  const handleRebook = (value: boolean) => {
    setLocalRebook(value);
    save({ would_rebook: value });
  };

  const handleTypeRating = (type: string, rating: number) => {
    const next = { ...localTypeFeedback, [type]: { ...localTypeFeedback[type], rating } };
    setLocalTypeFeedback(next);
    save({ type_feedback: next });
  };

  const handleTypeNotes = (type: string, notes: string) => {
    const next = { ...localTypeFeedback, [type]: { ...localTypeFeedback[type], notes } };
    setLocalTypeFeedback(next);
  };

  const handleTypeNotesBlur = () => {
    save({ type_feedback: localTypeFeedback });
  };

  const handleFeedbackBlur = () => {
    save({ entertainment_feedback: localFeedback });
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
        <label className="text-sm font-medium">Overall Entertainment Rating *</label>
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

      {/* Crowd Energy */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Crowd Energy</label>
        <Select
          value={localEnergy}
          onValueChange={(v) => handleEnergy(v as CrowdEnergy)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="How was the crowd?" />
          </SelectTrigger>
          <SelectContent>
            {CROWD_ENERGY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Would Rebook */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Would you rebook?</label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleRebook(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              localRebook === true
                ? 'bg-green-600 text-white border-green-600'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <ThumbsUp className="h-3.5 w-3.5" /> Yes
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleRebook(false)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              localRebook === false
                ? 'bg-red-600 text-white border-red-600'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <ThumbsDown className="h-3.5 w-3.5" /> No
          </button>
        </div>
      </div>

      {/* Per-Type Ratings */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Feedback by Type</label>
        {ENTERTAINMENT_TYPES.map((type) => (
          <div key={type} className="p-3 border rounded-md space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{type}</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleTypeRating(type, star)}
                    className={`p-0.5 transition-colors ${
                      (localTypeFeedback[type]?.rating ?? 0) >= star
                        ? 'text-yellow-500'
                        : 'text-gray-300 hover:text-yellow-400'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                  </button>
                ))}
              </div>
            </div>
            <Input
              placeholder={`Notes about ${type.toLowerCase()}...`}
              value={localTypeFeedback[type]?.notes ?? ''}
              onChange={(e) => handleTypeNotes(type, e.target.value)}
              onBlur={handleTypeNotesBlur}
              disabled={disabled}
              className="text-sm"
            />
          </div>
        ))}
      </div>

      {/* General Feedback */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Additional Notes</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Any other observations about tonight's entertainment..."
          rows={3}
          value={localFeedback}
          onChange={(e) => setLocalFeedback(e.target.value)}
          onBlur={handleFeedbackBlur}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
