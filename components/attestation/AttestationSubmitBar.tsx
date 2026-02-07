'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  Minus,
} from 'lucide-react';
import type { NightlyAttestation, TriggerResult } from '@/lib/attestation/types';
import type { CompletionState } from './useAttestation';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  completionState: CompletionState;
  canSubmit: boolean;
  isLocked: boolean;
  submitting: boolean;
  onSubmit: (amendmentReason?: string) => Promise<any>;
}

const MODULE_LABELS: Record<keyof CompletionState, string> = {
  revenue: 'Revenue',
  comps: 'Comps',
  labor: 'Labor',
  incidents: 'Incidents',
  coaching: 'Coaching',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'complete') return <CheckCircle2 className="h-3.5 w-3.5 text-sage" />;
  if (status === 'incomplete') return <XCircle className="h-3.5 w-3.5 text-error" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function AttestationSubmitBar({
  triggers,
  attestation,
  completionState,
  canSubmit,
  isLocked,
  submitting,
  onSubmit,
}: Props) {
  const [showAmend, setShowAmend] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [actionsCreated, setActionsCreated] = useState<number | null>(null);

  const requiredModules = Object.entries(completionState).filter(
    ([, v]) => v !== 'not_required' && v !== 'always_optional',
  );
  const completedCount = requiredModules.filter(([, v]) => v === 'complete').length;

  const handleSubmit = async () => {
    const result = await onSubmit();
    if (result?.success && result.actionsCreated !== undefined) {
      setActionsCreated(result.actionsCreated);
    }
  };

  const handleAmend = async () => {
    if (!amendReason.trim()) return;
    const result = await onSubmit(amendReason.trim());
    if (result?.success) {
      setShowAmend(false);
      setAmendReason('');
    }
  };

  // Locked state
  if (isLocked && !showAmend) {
    return (
      <div className="border border-sage/40 rounded-md p-4 bg-sage/5">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-sage" />
          <div className="flex-1">
            <div className="text-sm font-medium text-sage">
              Attestation {attestation?.status === 'amended' ? 'Amended' : 'Submitted'}
            </div>
            <div className="text-xs text-muted-foreground">
              {attestation?.submitted_at &&
                new Date(attestation.submitted_at).toLocaleString()}
              {attestation?.amendment_reason && (
                <span className="ml-2">
                  — Amendment: {attestation.amendment_reason}
                </span>
              )}
            </div>
          </div>
          {actionsCreated !== null && actionsCreated > 0 && (
            <span className="text-xs text-brass">
              {actionsCreated} action{actionsCreated !== 1 ? 's' : ''} created
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAmend(true)}
          >
            Amend
          </Button>
        </div>
      </div>
    );
  }

  // Amendment form
  if (showAmend) {
    return (
      <div className="border border-brass/40 rounded-md p-4 bg-brass/5 space-y-3">
        <div className="text-sm font-medium text-brass">Amend Attestation</div>
        <Textarea
          placeholder="Reason for amendment (required)..."
          rows={2}
          maxLength={500}
          value={amendReason}
          onChange={(e) => setAmendReason(e.target.value)}
        />
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowAmend(false)}>
            Cancel
          </Button>
          <Button
            variant="brass"
            size="sm"
            onClick={handleAmend}
            disabled={!amendReason.trim() || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Amending...
              </>
            ) : (
              'Submit Amendment'
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Draft state — show progress + submit
  return (
    <div className="border border-brass/30 rounded-md p-4 bg-muted/20">
      {/* Module status chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {Object.entries(completionState).map(([key, status]) => (
          <div
            key={key}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-background border text-xs"
          >
            <StatusIcon status={status} />
            <span>{MODULE_LABELS[key as keyof CompletionState]}</span>
          </div>
        ))}
      </div>

      {/* Progress text */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {requiredModules.length === 0 ? (
            'No modules required — submit when ready'
          ) : (
            <>
              {completedCount} of {requiredModules.length} required module
              {requiredModules.length !== 1 ? 's' : ''} complete
            </>
          )}
        </div>

        <Button
          variant="brass"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Submit & Lock
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
