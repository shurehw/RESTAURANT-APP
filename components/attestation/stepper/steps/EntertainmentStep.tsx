'use client';

import { EntertainmentFeedback } from '@/components/attestation/EntertainmentFeedback';
import type { ShiftLog } from '@/lib/entertainment/types';

interface Props {
  venueId: string | undefined;
  businessDate: string;
  shiftLog: ShiftLog | null;
  onShiftLogUpdate: (log: ShiftLog) => void;
  disabled: boolean;
}

export function EntertainmentStep({
  venueId,
  businessDate,
  shiftLog,
  onShiftLogUpdate,
  disabled,
}: Props) {
  if (!venueId) return null;

  return (
    <div className="space-y-4">
      <EntertainmentFeedback
        venueId={venueId}
        businessDate={businessDate}
        shiftLog={shiftLog}
        onUpdate={onShiftLogUpdate}
        disabled={disabled}
      />
    </div>
  );
}
