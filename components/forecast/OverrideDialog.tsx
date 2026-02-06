'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const REASON_CODES = [
  { value: 'PRIVATE_EVENT', label: 'Private Event' },
  { value: 'PROMO_MARKETING', label: 'Promo / Marketing' },
  { value: 'WEATHER', label: 'Weather' },
  { value: 'VIP_GROUP', label: 'VIP Group' },
  { value: 'BUYOUT', label: 'Buyout' },
  { value: 'LOCAL_EVENT', label: 'Local Event' },
  { value: 'HOLIDAY_BEHAVIOR', label: 'Holiday Behavior' },
  { value: 'MANAGER_GUT', label: 'Manager Instinct' },
  { value: 'OTHER', label: 'Other' },
] as const;

interface OverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forecast: {
    venue_id: string;
    business_date: string;
    shift_type: string;
    covers_predicted: number;
    day_type?: string;
    holiday_code?: string;
    day_type_offset?: number;
    holiday_offset?: number;
    pacing_multiplier?: number;
    covers_raw?: number;
  } | null;
  onSaved?: () => void;
}

export function OverrideDialog({ open, onOpenChange, forecast, onSaved }: OverrideDialogProps) {
  const [newValue, setNewValue] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && forecast) {
      setNewValue(String(forecast.covers_predicted));
      setReasonCode('');
      setReasonText('');
      setError('');
    }
    onOpenChange(isOpen);
  };

  const delta = forecast ? parseInt(newValue || '0') - forecast.covers_predicted : 0;

  const handleSubmit = async () => {
    if (!forecast || !reasonCode) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/forecast/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: forecast.venue_id,
          businessDate: forecast.business_date,
          shiftType: forecast.shift_type,
          forecastPreOverride: forecast.covers_predicted,
          forecastPostOverride: parseInt(newValue),
          reasonCode,
          reasonText: reasonText || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save override');
      }

      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!forecast) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Override Forecast</DialogTitle>
          <DialogDescription>
            {new Date(forecast.business_date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Layer breakdown */}
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base model</span>
            <span className="font-mono">{forecast.covers_raw ?? '?'}</span>
          </div>
          {forecast.day_type_offset !== undefined && forecast.day_type_offset !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Day-type offset ({forecast.day_type})</span>
              <span className="font-mono">{forecast.day_type_offset > 0 ? '+' : ''}{forecast.day_type_offset}</span>
            </div>
          )}
          {forecast.holiday_code && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Holiday ({forecast.holiday_code})</span>
              <span className="font-mono">{(forecast.holiday_offset || 0) > 0 ? '+' : ''}{forecast.holiday_offset || 0}</span>
            </div>
          )}
          {forecast.pacing_multiplier !== undefined && forecast.pacing_multiplier !== 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pacing multiplier</span>
              <span className="font-mono">x{forecast.pacing_multiplier?.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 font-medium">
            <span>AI forecast</span>
            <span className="font-mono">{forecast.covers_predicted}</span>
          </div>
        </div>

        {/* Override input */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="override-value">Your forecast (covers)</Label>
            <div className="flex items-center gap-3 mt-1">
              <Input
                id="override-value"
                type="number"
                min={0}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="font-mono text-lg"
              />
              {delta !== 0 && (
                <Badge variant={delta > 0 ? 'sage' : 'error'} className="whitespace-nowrap">
                  {delta > 0 ? '+' : ''}{delta}
                </Badge>
              )}
            </div>
          </div>

          <div>
            <Label>Reason</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(reasonCode === 'OTHER' || reasonCode) && (
            <div>
              <Label htmlFor="reason-text">Notes (optional)</Label>
              <Textarea
                id="reason-text"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="e.g., 200-person buyout confirmed by GM"
                className="mt-1"
                rows={2}
              />
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !reasonCode || !newValue}
          >
            {saving ? 'Saving...' : 'Save Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
