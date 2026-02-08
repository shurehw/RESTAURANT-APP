'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ClipboardCheck,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { NightlyAttestation, TriggerResult, NightlyIncident, CoachingAction } from '@/lib/attestation/types';
import type { CompletionState } from './useAttestation';
import { IncidentLog } from './IncidentLog';
import { CoachingQueue } from './CoachingQueue';
import { AttestationSubmitBar } from './AttestationSubmitBar';

interface Props {
  attestation: NightlyAttestation | null;
  triggers: TriggerResult | null;
  incidents: NightlyIncident[];
  coachingActions: CoachingAction[];
  completionState: CompletionState;
  canSubmit: boolean;
  isLocked: boolean;
  loading: boolean;
  saving: boolean;
  submitting: boolean;
  error: string | null;
  onAddIncident: (incident: any) => Promise<void>;
  onAddCoaching: (coaching: any) => Promise<void>;
  onSubmit: (amendmentReason?: string) => Promise<any>;
}

export function AttestationFooter({
  attestation,
  triggers,
  incidents,
  coachingActions,
  completionState,
  canSubmit,
  isLocked,
  loading,
  saving,
  submitting,
  error,
  onAddIncident,
  onAddCoaching,
  onSubmit,
}: Props) {
  return (
    <Card className="border-brass/30 bg-brass/[0.02]">
      <CardHeader className="border-b border-brass/20 py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-brass" />
          Attestation — Incidents, Coaching & Submit
          {saving && (
            <span className="text-xs text-muted-foreground ml-2">Saving...</span>
          )}
          {isLocked && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-sage text-white rounded ml-2">
              {attestation?.status === 'amended' ? 'Amended' : 'Submitted'}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brass" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading attestation...
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-error/5 border border-error/30 rounded-md p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-error shrink-0" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {!loading && attestation && (
          <>
            {/* Incidents */}
            <IncidentLog
              triggers={triggers}
              incidents={incidents}
              onAdd={onAddIncident}
              disabled={isLocked}
            />

            {/* Coaching */}
            <CoachingQueue
              actions={coachingActions}
              onAdd={onAddCoaching}
              disabled={isLocked}
            />

            {/* Submit bar */}
            <AttestationSubmitBar
              triggers={triggers}
              attestation={attestation}
              completionState={completionState}
              canSubmit={canSubmit}
              isLocked={isLocked}
              submitting={submitting}
              onSubmit={onSubmit}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
