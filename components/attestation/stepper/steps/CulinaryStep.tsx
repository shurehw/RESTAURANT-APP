'use client';

import { CulinaryFeedback } from '@/components/attestation/CulinaryFeedback';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import type {
  NightlyAttestation,
  CulinaryTag,
} from '@/lib/attestation/types';
import { CULINARY_TAGS, CULINARY_TAG_LABELS } from '@/lib/attestation/types';
import type { CulinaryShiftLog } from '@/lib/culinary/types';

interface Props {
  venueId: string;
  businessDate: string;
  culinaryLog: CulinaryShiftLog | null;
  onCulinaryLogUpdate: (log: CulinaryShiftLog) => void;
  disabled: boolean;
  // AI narrative + tags
  narrative?: string | null;
  narrativeLoading?: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function CulinaryStep({
  venueId,
  businessDate,
  culinaryLog,
  onCulinaryLogUpdate,
  disabled,
  narrative,
  narrativeLoading,
  attestation,
  onUpdate,
}: Props) {
  return (
    <div className="space-y-4">
      <NarrativeCard
        title="AI Culinary Brief"
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
      />

      <CulinaryFeedback
        venueId={venueId}
        businessDate={businessDate}
        culinaryLog={culinaryLog}
        onUpdate={onCulinaryLogUpdate}
        disabled={disabled}
      />

      {onUpdate && (
        <>
          <TagSelector<CulinaryTag>
            tags={CULINARY_TAGS}
            labels={CULINARY_TAG_LABELS}
            selected={attestation?.culinary_tags ?? []}
            onChange={(tags) => onUpdate({ culinary_tags: tags })}
            disabled={disabled}
            title="What defined tonight's kitchen?"
          />

          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Additional culinary notes (optional)..."
            rows={2}
            maxLength={500}
            value={attestation?.culinary_notes ?? ''}
            onChange={(e) => onUpdate({ culinary_notes: e.target.value })}
            onBlur={(e) => onUpdate({ culinary_notes: e.target.value })}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}
