'use client';

import { CulinaryFeedback } from '@/components/attestation/CulinaryFeedback';
import type { CulinaryShiftLog } from '@/lib/culinary/types';

interface Props {
  venueId: string | undefined;
  businessDate: string;
  culinaryLog: CulinaryShiftLog | null;
  onCulinaryLogUpdate: (log: CulinaryShiftLog) => void;
  disabled: boolean;
}

export function CulinaryStep({
  venueId,
  businessDate,
  culinaryLog,
  onCulinaryLogUpdate,
  disabled,
}: Props) {
  if (!venueId) return null;

  return (
    <div className="space-y-4">
      <CulinaryFeedback
        venueId={venueId}
        businessDate={businessDate}
        culinaryLog={culinaryLog}
        onUpdate={onCulinaryLogUpdate}
        disabled={disabled}
      />
    </div>
  );
}
