'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  DollarSign,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import type { NightlyAttestation, TriggerResult, RevenueTag } from '@/lib/attestation/types';
import {
  REVENUE_TAGS,
  REVENUE_TAG_LABELS,
  REVENUE_TAG_BY_CATEGORY,
  REVENUE_TAG_CATEGORY_LABELS,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  narrative?: string | null;
  narrativeLoading?: boolean;
}

export function RevenueAttestation({ triggers, attestation, onUpdate, disabled, narrative, narrativeLoading }: Props) {
  const isRequired = triggers?.revenue_attestation_required ?? false;
  const selectedTags = (attestation?.revenue_tags || []) as RevenueTag[];
  const isComplete =
    attestation?.revenue_confirmed === true ||
    (selectedTags.length > 0);

  return (
    <div className="space-y-4">
      {/* AI Narrative */}
      <NarrativeCard
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
        title="AI Sales Brief"
      />

      {/* Driver Tags */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <TagSelector<RevenueTag>
            tags={REVENUE_TAGS}
            labels={REVENUE_TAG_LABELS}
            selected={selectedTags}
            onChange={(tags) => onUpdate({ revenue_tags: tags } as any)}
            disabled={disabled}
            categories={REVENUE_TAG_BY_CATEGORY as Record<string, RevenueTag[]>}
            categoryLabels={REVENUE_TAG_CATEGORY_LABELS as Record<string, string>}
            title="What drove tonight's performance?"
          />
        </CardContent>
      </Card>

      {/* Attestation Form */}
      <Card className={isRequired ? 'border-brass/40' : 'border-muted'}>
        <CardHeader className="border-b border-brass/20 py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-brass" />
            Revenue Attestation
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
          {triggers?.revenue_triggers && triggers.revenue_triggers.length > 0 && (
            <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
                <AlertTriangle className="h-3.5 w-3.5" />
                Trigger reasons
              </div>
              {triggers.revenue_triggers.map((reason, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-5">
                  {reason}
                </p>
              ))}
            </div>
          )}

          {/* Revenue confirmed checkbox */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="revenue-confirmed"
              checked={attestation?.revenue_confirmed === true}
              onCheckedChange={(checked) => {
                onUpdate({
                  revenue_confirmed: checked === true,
                  revenue_variance_reason: checked === true ? null : attestation?.revenue_variance_reason,
                } as any);
              }}
              disabled={disabled}
            />
            <label
              htmlFor="revenue-confirmed"
              className="text-sm leading-tight cursor-pointer"
            >
              Revenue is accurate and within expected range — no variance explanation needed
            </label>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Manager notes (optional, 500 char max)
            </label>
            <Textarea
              placeholder="Additional context..."
              rows={2}
              maxLength={500}
              defaultValue={attestation?.revenue_notes || ''}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val !== (attestation?.revenue_notes || '')) {
                  onUpdate({ revenue_notes: val || null } as any);
                }
              }}
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
