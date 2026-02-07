'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { NightlyAttestation, TriggerResult } from '@/lib/attestation/types';
import {
  LABOR_VARIANCE_REASONS,
  LABOR_VARIANCE_LABELS,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
}

export function LaborAttestation({ triggers, attestation, onUpdate, disabled }: Props) {
  const isRequired = triggers?.labor_attestation_required ?? false;
  const isComplete =
    attestation?.labor_confirmed === true ||
    attestation?.labor_confirmed === false ||
    !!attestation?.labor_variance_reason;

  return (
    <Card className={isRequired ? 'border-brass/40' : 'border-muted'}>
      <CardHeader className="border-b border-brass/20 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-brass" />
          Labor Attestation
          {isRequired && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-brass text-white rounded ml-2">
              Required
            </span>
          )}
          {isComplete && (
            <CheckCircle2 className="h-4 w-4 text-sage ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Trigger reasons */}
        {triggers?.labor_triggers && triggers.labor_triggers.length > 0 && (
          <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
              <AlertTriangle className="h-3.5 w-3.5" />
              Trigger reasons
            </div>
            {triggers.labor_triggers.map((reason, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-5">
                {reason}
              </p>
            ))}
          </div>
        )}

        {/* Labor confirmed checkbox */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="labor-confirmed"
            checked={attestation?.labor_confirmed === true}
            onCheckedChange={(checked) => {
              onUpdate({
                labor_confirmed: checked === true,
                labor_variance_reason: checked === true ? null : attestation?.labor_variance_reason,
              } as any);
            }}
            disabled={disabled}
          />
          <label
            htmlFor="labor-confirmed"
            className="text-sm leading-tight cursor-pointer"
          >
            Labor cost is accurate and within expected range — no variance explanation needed
          </label>
        </div>

        {/* Variance reason */}
        {attestation?.labor_confirmed !== true && (
          <div className="space-y-2 pl-7">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              Select the primary reason for labor variance
            </div>
            <Select
              value={attestation?.labor_variance_reason || ''}
              onValueChange={(value) =>
                onUpdate({
                  labor_variance_reason: value as any,
                  labor_confirmed: false,
                })
              }
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select variance reason..." />
              </SelectTrigger>
              <SelectContent>
                {LABOR_VARIANCE_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {LABOR_VARIANCE_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Notes (optional, 500 char max)
          </label>
          <Textarea
            placeholder="Additional context..."
            rows={2}
            maxLength={500}
            defaultValue={attestation?.labor_notes || ''}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (attestation?.labor_notes || '')) {
                onUpdate({ labor_notes: val || null } as any);
              }
            }}
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
