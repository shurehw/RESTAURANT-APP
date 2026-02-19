'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
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
  const selectedTags = (attestation?.revenue_tags || []) as RevenueTag[];

  return (
    <div className="space-y-4">
      {/* AI Narrative */}
      <NarrativeCard
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
        title="AI Sales Brief"
      />

      {/* Trigger reasons — contextual callout */}
      {triggers?.revenue_triggers && triggers.revenue_triggers.length > 0 && (
        <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
            <AlertTriangle className="h-3.5 w-3.5" />
            Flagged
          </div>
          {triggers.revenue_triggers.map((reason, i) => (
            <p key={i} className="text-xs text-muted-foreground pl-5">
              {reason}
            </p>
          ))}
        </div>
      )}

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
    </div>
  );
}
