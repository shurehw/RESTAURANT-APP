'use client';

import { CoachingQueue } from '@/components/attestation/CoachingQueue';
import type { CoachingAction } from '@/lib/attestation/types';

interface Props {
  actions: CoachingAction[];
  onAdd: (action: any) => Promise<void>;
  disabled: boolean;
}

export function CoachingStep({ actions, onAdd, disabled }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Optionally log coaching actions — recognitions, corrections, training needs, or follow-ups from tonight's service.
      </p>

      <CoachingQueue
        actions={actions}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
