'use client';

import { useState, useCallback } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ChefHat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { CompResolution, TriggerResult, NightlyAttestation } from '@/lib/attestation/types';
import { COMP_RESOLUTION_LABELS, type CompResolutionCode } from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  resolutions: CompResolution[];
  onAdd: (resolution: any) => Promise<void>;
  disabled: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function BOHCompRow({
  comp,
  existingResolution,
  onAdd,
  disabled,
}: {
  comp: TriggerResult['flagged_comps'][number];
  existingResolution?: CompResolution;
  onAdd: (resolution: any) => Promise<void>;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState(existingResolution?.boh_notes ?? '');
  const [saving, setSaving] = useState(false);
  const hasSaved = !!(existingResolution?.boh_notes);
  const fohResolved = existingResolution && existingResolution.resolution_code !== 'pending_foh_resolution';

  const handleSave = useCallback(async () => {
    if (!notes.trim()) return;
    setSaving(true);
    await onAdd({
      check_id: comp.check_id,
      check_amount: comp.check_amount,
      comp_amount: comp.comp_amount,
      comp_reason_pos: comp.comp_reason,
      employee_name: comp.employee_name,
      boh_notes: notes.trim(),
    });
    setSaving(false);
  }, [notes, comp, onAdd]);

  return (
    <div className="px-4 py-3 space-y-2">
      {/* Comp summary */}
      <div className="flex items-center gap-3">
        {hasSaved ? (
          <CheckCircle2 className="h-4 w-4 text-sage shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-brass shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {formatCurrency(comp.comp_amount)} comp
            </span>
            {comp.check_amount > 0 && (
              <span className="text-muted-foreground">
                of {formatCurrency(comp.check_amount)} check
              </span>
            )}
            <span className="text-muted-foreground">— {comp.employee_name}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            {comp.table_name && <span>{comp.table_name}</span>}
            {comp.cardholder_name && <span>· {comp.cardholder_name}</span>}
            {comp.comped_items && comp.comped_items.length > 0 && (
              <span>· {comp.comped_items.slice(0, 3).join(', ')}{comp.comped_items.length > 3 ? ` +${comp.comped_items.length - 3}` : ''}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">
            {comp.trigger_reasons.join(' | ')}
          </div>
        </div>
      </div>

      {/* FOH resolution badge (if already resolved) */}
      {fohResolved && (
        <div className="ml-7 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
          FOH resolved: {COMP_RESOLUTION_LABELS[existingResolution!.resolution_code as CompResolutionCode]}
          {existingResolution!.resolution_notes && ` — ${existingResolution!.resolution_notes}`}
        </div>
      )}

      {/* Kitchen context textarea */}
      <div className="ml-7 space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <ChefHat className="h-3.5 w-3.5 text-brass" />
          Kitchen Context
        </label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="What happened on the kitchen side? Wrong order, quality issue, timing, 86'd item substitution..."
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {notes.length}/1000
          </span>
          <Button
            size="sm"
            variant="brass"
            onClick={handleSave}
            disabled={disabled || !notes.trim() || saving || (notes.trim() === (existingResolution?.boh_notes ?? ''))}
          >
            {saving ? 'Saving...' : hasSaved ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BOHCompsStep({ triggers, resolutions, onAdd, disabled, attestation, onUpdate }: Props) {
  const flaggedComps = triggers?.flagged_comps || [];
  const notedCount = resolutions.filter((r) => r.boh_notes && r.boh_notes.length > 0).length;
  const totalCount = flaggedComps.length;
  const isAcknowledged = !!(attestation as any)?.boh_comps_acknowledged;
  const isComplete = notedCount >= totalCount || isAcknowledged;

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-muted p-6 text-center">
        <CheckCircle2 className="h-6 w-6 text-sage mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No comps flagged for review tonight.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-brass" />
        <h3 className="text-sm font-medium">Kitchen Context for Flagged Comps</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {notedCount} of {totalCount} noted
        </span>
        {isComplete && <CheckCircle2 className="h-4 w-4 text-sage" />}
      </div>

      <p className="text-xs text-muted-foreground">
        Provide kitchen-side context for each flagged comp. If a comp wasn't related to the kitchen, skip it or use the acknowledgment below.
      </p>

      {/* Comp list */}
      <div className="rounded-lg border divide-y divide-border">
        {flaggedComps.map((comp) => {
          const existing = resolutions.find((r) => r.check_id === comp.check_id);
          return (
            <BOHCompRow
              key={comp.check_id}
              comp={comp}
              existingResolution={existing}
              onAdd={onAdd}
              disabled={disabled}
            />
          );
        })}
      </div>

      {/* Acknowledgment checkbox */}
      {!isComplete && onUpdate && (
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <Checkbox
            checked={isAcknowledged}
            onCheckedChange={(checked) =>
              onUpdate({ boh_comps_acknowledged: !!checked } as any)
            }
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            No kitchen context to add — comps not related to BOH
          </span>
        </label>
      )}
    </div>
  );
}
