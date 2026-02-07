'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { CompResolution, TriggerResult } from '@/lib/attestation/types';
import {
  COMP_RESOLUTION_CODES,
  COMP_RESOLUTION_LABELS,
  type CompResolutionCode,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  resolutions: CompResolution[];
  onAdd: (resolution: any) => Promise<void>;
  disabled: boolean;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function CompResolutionPanel({ triggers, resolutions, onAdd, disabled }: Props) {
  const flaggedComps = triggers?.flagged_comps || [];
  const isRequired = triggers?.comp_resolution_required ?? false;
  const resolvedCount = resolutions.length;
  const totalCount = flaggedComps.length;
  const isComplete = resolvedCount >= totalCount;

  return (
    <Card className={isRequired ? 'border-brass/40' : 'border-muted'}>
      <CardHeader className="border-b border-brass/20 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-brass" />
          Comp Resolutions
          {isRequired && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-brass text-white rounded ml-2">
              Required
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            {resolvedCount} of {totalCount} resolved
          </span>
          {isComplete && totalCount > 0 && (
            <CheckCircle2 className="h-4 w-4 text-sage ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {flaggedComps.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No comps flagged for resolution.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {flaggedComps.map((comp) => {
              const existing = resolutions.find(
                (r) => r.check_id === comp.check_id,
              );
              return (
                <CompRow
                  key={comp.check_id}
                  comp={comp}
                  existingResolution={existing}
                  onAdd={onAdd}
                  disabled={disabled}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Individual comp row with inline resolution form
// ---------------------------------------------------------------------------

interface CompRowProps {
  comp: TriggerResult['flagged_comps'][number];
  existingResolution?: CompResolution;
  onAdd: (resolution: any) => Promise<void>;
  disabled: boolean;
}

function CompRow({ comp, existingResolution, onAdd, disabled }: CompRowProps) {
  const [expanded, setExpanded] = useState(!existingResolution);
  const [resolutionCode, setResolutionCode] = useState<CompResolutionCode | ''>('');
  const [notes, setNotes] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!resolutionCode) return;
    setSaving(true);
    await onAdd({
      check_id: comp.check_id,
      check_amount: comp.check_amount,
      comp_amount: comp.comp_amount,
      comp_reason_pos: comp.comp_reason,
      employee_name: comp.employee_name,
      resolution_code: resolutionCode,
      resolution_notes: notes || undefined,
      approved_by: approvedBy || undefined,
      requires_follow_up: followUp,
    });
    setSaving(false);
    setExpanded(false);
  };

  if (existingResolution) {
    return (
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <CheckCircle2 className="h-4 w-4 text-sage shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-2">
            <span className="font-medium">#{comp.check_id}</span>
            <span className="text-muted-foreground">
              {formatCurrency(comp.comp_amount)} — {comp.employee_name}
            </span>
          </div>
          {expanded && (
            <div className="mt-1 text-xs text-muted-foreground">
              Resolution: {COMP_RESOLUTION_LABELS[existingResolution.resolution_code as CompResolutionCode]}
              {existingResolution.resolution_notes && (
                <span> — {existingResolution.resolution_notes}</span>
              )}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* Comp summary */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <AlertTriangle className="h-4 w-4 text-error shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-2">
            <span className="font-medium">#{comp.check_id}</span>
            <span className="text-muted-foreground">
              {formatCurrency(comp.comp_amount)} of {formatCurrency(comp.check_amount)}
            </span>
            <span className="text-muted-foreground">— {comp.employee_name}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {comp.trigger_reasons.join(' | ')}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Resolution form */}
      {expanded && (
        <div className="mt-3 pl-7 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Resolution code *</label>
            <Select
              value={resolutionCode}
              onValueChange={(v) => setResolutionCode(v as CompResolutionCode)}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select resolution..." />
              </SelectTrigger>
              <SelectContent>
                {COMP_RESOLUTION_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {COMP_RESOLUTION_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Approved by</label>
              <Input
                placeholder="Manager name"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                disabled={disabled}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                placeholder="Resolution notes..."
                rows={1}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={disabled}
                className="min-h-[32px] text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`follow-up-${comp.check_id}`}
                checked={followUp}
                onCheckedChange={(c) => setFollowUp(c === true)}
                disabled={disabled}
              />
              <label
                htmlFor={`follow-up-${comp.check_id}`}
                className="text-xs cursor-pointer"
              >
                Requires follow-up
              </label>
            </div>
            <Button
              size="sm"
              variant="brass"
              onClick={handleSave}
              disabled={disabled || !resolutionCode || saving}
            >
              {saving ? 'Saving...' : 'Resolve'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
