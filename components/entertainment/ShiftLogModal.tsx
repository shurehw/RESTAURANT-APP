'use client';

/**
 * Shift Log Modal
 * Manager feedback form for nightly entertainment performance
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Star, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import type { ShiftLog, CrowdEnergy, EntertainmentType } from '@/lib/entertainment/types';

interface ShiftLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId?: string;
  venueName?: string;
  businessDate: string;
  existingLog?: ShiftLog;
  entertainmentCost?: number;
  actualSales?: number;
  onSuccess?: () => void;
}

const CROWD_ENERGY_OPTIONS: { value: CrowdEnergy; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Quiet night, minimal energy' },
  { value: 'moderate', label: 'Moderate', description: 'Decent crowd, steady vibe' },
  { value: 'high', label: 'High', description: 'Great energy, packed house' },
  { value: 'exceptional', label: 'Exceptional', description: 'Electric atmosphere, unforgettable night' },
];

const ENTERTAINMENT_TYPES: EntertainmentType[] = ['Band', 'Dancers', 'DJ', 'AV'];

export function ShiftLogModal({
  open,
  onOpenChange,
  venueId,
  venueName,
  businessDate,
  existingLog,
  entertainmentCost,
  actualSales,
  onSuccess,
}: ShiftLogModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<{
    overall_rating: number;
    crowd_energy: CrowdEnergy | '';
    entertainment_feedback: string;
    would_rebook: boolean | null;
    type_feedback: Record<string, { rating?: number; notes?: string }>;
  }>({
    overall_rating: 0,
    crowd_energy: '',
    entertainment_feedback: '',
    would_rebook: null,
    type_feedback: {},
  });

  // Initialize form with existing log data
  useEffect(() => {
    if (existingLog) {
      setFormData({
        overall_rating: existingLog.overall_rating || 0,
        crowd_energy: existingLog.crowd_energy || '',
        entertainment_feedback: existingLog.entertainment_feedback || '',
        would_rebook: existingLog.would_rebook ?? null,
        type_feedback: existingLog.type_feedback || {},
      });
    } else {
      setFormData({
        overall_rating: 0,
        crowd_energy: '',
        entertainment_feedback: '',
        would_rebook: null,
        type_feedback: {},
      });
    }
  }, [existingLog, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.overall_rating) {
      toast.error('Please provide an overall rating');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/entertainment/shift-logs', {
        method: existingLog?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existingLog?.id,
          venue_id: venueId,
          business_date: businessDate,
          overall_rating: formData.overall_rating,
          crowd_energy: formData.crowd_energy || null,
          entertainment_feedback: formData.entertainment_feedback || null,
          would_rebook: formData.would_rebook,
          type_feedback: formData.type_feedback,
          total_entertainment_cost: entertainmentCost,
          actual_sales: actualSales,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save shift log');
      }

      toast.success('Shift log saved successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save shift log');
    } finally {
      setLoading(false);
    }
  };

  const setRating = (rating: number) => {
    setFormData({ ...formData, overall_rating: rating });
  };

  const setTypeRating = (type: string, rating: number) => {
    setFormData({
      ...formData,
      type_feedback: {
        ...formData.type_feedback,
        [type]: { ...formData.type_feedback[type], rating },
      },
    });
  };

  const setTypeNotes = (type: string, notes: string) => {
    setFormData({
      ...formData,
      type_feedback: {
        ...formData.type_feedback,
        [type]: { ...formData.type_feedback[type], notes },
      },
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const entertainmentPct = actualSales && entertainmentCost
    ? ((entertainmentCost / actualSales) * 100).toFixed(1)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Shift Log - {formatDate(businessDate)}</DialogTitle>
          <DialogDescription>
            {venueName || 'Entertainment'} performance feedback
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Financial Summary */}
          {(entertainmentCost || actualSales) && (
            <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
              {entertainmentCost && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entertainment Cost</span>
                  <span className="font-medium">${entertainmentCost.toLocaleString()}</span>
                </div>
              )}
              {actualSales && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual Sales</span>
                  <span className="font-medium">${actualSales.toLocaleString()}</span>
                </div>
              )}
              {entertainmentPct && (
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Entertainment %</span>
                  <span className="font-semibold">{entertainmentPct}%</span>
                </div>
              )}
            </div>
          )}

          {/* Overall Rating */}
          <div className="space-y-2">
            <Label>Overall Entertainment Rating *</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`p-2 rounded-md transition-colors ${
                    formData.overall_rating >= star
                      ? 'text-yellow-500 bg-yellow-50'
                      : 'text-gray-300 hover:text-yellow-400 hover:bg-yellow-50/50'
                  }`}
                >
                  <Star className="h-6 w-6 fill-current" />
                </button>
              ))}
            </div>
          </div>

          {/* Crowd Energy */}
          <div className="space-y-2">
            <Label htmlFor="crowd_energy">Crowd Energy</Label>
            <Select
              value={formData.crowd_energy}
              onValueChange={(value) => setFormData({ ...formData, crowd_energy: value as CrowdEnergy })}
            >
              <SelectTrigger>
                <SelectValue placeholder="How was the crowd?" />
              </SelectTrigger>
              <SelectContent>
                {CROWD_ENERGY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <span className="font-medium">{option.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Would Rebook */}
          <div className="space-y-2">
            <Label>Would you rebook tonight's entertainment?</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={formData.would_rebook === true ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFormData({ ...formData, would_rebook: true })}
                className={formData.would_rebook === true ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Yes
              </Button>
              <Button
                type="button"
                variant={formData.would_rebook === false ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFormData({ ...formData, would_rebook: false })}
                className={formData.would_rebook === false ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                No
              </Button>
            </div>
          </div>

          {/* Entertainment Type Feedback */}
          <div className="space-y-3">
            <Label>Feedback by Type (optional)</Label>
            {ENTERTAINMENT_TYPES.map((type) => (
              <div key={type} className="p-3 border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{type}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setTypeRating(type, star)}
                        className={`p-1 transition-colors ${
                          (formData.type_feedback[type]?.rating || 0) >= star
                            ? 'text-yellow-500'
                            : 'text-gray-300 hover:text-yellow-400'
                        }`}
                      >
                        <Star className="h-4 w-4 fill-current" />
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  placeholder={`Notes about ${type.toLowerCase()}...`}
                  value={formData.type_feedback[type]?.notes || ''}
                  onChange={(e) => setTypeNotes(type, e.target.value)}
                  className="text-sm"
                />
              </div>
            ))}
          </div>

          {/* General Feedback */}
          <div className="space-y-2">
            <Label htmlFor="entertainment_feedback">Additional Notes</Label>
            <Textarea
              id="entertainment_feedback"
              value={formData.entertainment_feedback}
              onChange={(e) => setFormData({ ...formData, entertainment_feedback: e.target.value })}
              placeholder="Any other observations about tonight's entertainment..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingLog?.id ? 'Update' : 'Submit'} Shift Log
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
