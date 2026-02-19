'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import type { NightlyAttestation, TriggerResult, LaborTag } from '@/lib/attestation/types';
import {
  LABOR_TAGS,
  LABOR_TAG_LABELS,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  narrative?: string | null;
  narrativeLoading?: boolean;
}

export function LaborAttestation({ triggers, attestation, onUpdate, disabled, narrative, narrativeLoading }: Props) {
  const selectedTags = (attestation?.labor_tags || []) as LaborTag[];

  return (
    <div className="space-y-4">
      {/* AI Narrative */}
      <NarrativeCard
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
        title="AI Labor Brief"
      />

      {/* Trigger reasons — contextual callout */}
      {triggers?.labor_triggers && triggers.labor_triggers.length > 0 && (
        <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
            <AlertTriangle className="h-3.5 w-3.5" />
            Flagged
          </div>
          {triggers.labor_triggers.map((reason, i) => (
            <p key={i} className="text-xs text-muted-foreground pl-5">
              {reason}
            </p>
          ))}
        </div>
      )}

      {/* Driver Tags */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <TagSelector<LaborTag>
            tags={LABOR_TAGS}
            labels={LABOR_TAG_LABELS}
            selected={selectedTags}
            onChange={(tags) => onUpdate({ labor_tags: tags } as any)}
            disabled={disabled}
            title="What drove tonight's labor?"
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
    </div>
  );
}
