'use client';

import { CoachingQueue } from '@/components/attestation/CoachingQueue';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import type {
  CoachingAction,
  NightlyAttestation,
  CoachingTag,
} from '@/lib/attestation/types';
import { COACHING_TAGS, COACHING_TAG_LABELS } from '@/lib/attestation/types';

interface Props {
  actions: CoachingAction[];
  onAdd: (action: any) => Promise<void>;
  disabled: boolean;
  // AI narrative + tags
  narrative?: string | null;
  narrativeLoading?: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function CoachingStep({
  actions,
  onAdd,
  disabled,
  narrative,
  narrativeLoading,
  attestation,
  onUpdate,
}: Props) {
  return (
    <div className="space-y-4">
      <NarrativeCard
        title="AI Coaching Brief"
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
      />

      {onUpdate && (
        <>
          <TagSelector<CoachingTag>
            tags={COACHING_TAGS}
            labels={COACHING_TAG_LABELS}
            selected={attestation?.coaching_tags ?? []}
            onChange={(tags) => onUpdate({ coaching_tags: tags })}
            disabled={disabled}
            title="What prompted coaching tonight?"
          />

          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Additional coaching notes (optional)..."
            rows={2}
            maxLength={500}
            value={attestation?.coaching_notes ?? ''}
            onChange={(e) => onUpdate({ coaching_notes: e.target.value })}
            onBlur={(e) => onUpdate({ coaching_notes: e.target.value })}
            disabled={disabled}
          />
        </>
      )}

      <CoachingQueue
        actions={actions}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
