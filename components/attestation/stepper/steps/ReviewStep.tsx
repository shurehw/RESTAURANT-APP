'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  XCircle,
  Minus,
  Lock,
  Loader2,
  ClipboardCheck,
} from 'lucide-react';
import type { NightlyAttestation, TriggerResult, CompResolution, NightlyIncident, CoachingAction } from '@/lib/attestation/types';
import type { CompletionState } from '@/components/attestation/useAttestation';
import {
  REVENUE_VARIANCE_LABELS,
  LABOR_VARIANCE_LABELS,
  COMP_RESOLUTION_LABELS,
  REVENUE_TAG_LABELS,
  LABOR_TAG_LABELS,
  COMP_TAG_LABELS,
  INCIDENT_TAG_LABELS,
  COACHING_TAG_LABELS,
  ENTERTAINMENT_TAG_LABELS,
  CULINARY_TAG_LABELS,
  type RevenueVarianceReason,
  type LaborVarianceReason,
  type CompResolutionCode,
  type RevenueTag,
  type LaborTag,
  type CompTag,
  type IncidentTag,
  type CoachingTag,
  type EntertainmentTag,
  type CulinaryTag,
} from '@/lib/attestation/types';
import type { StepConfig } from '../StepIndicator';

interface Props {
  attestation: NightlyAttestation | null;
  triggers: TriggerResult | null;
  compResolutions: CompResolution[];
  incidents: NightlyIncident[];
  coachingActions: CoachingAction[];
  completionState: CompletionState;
  canSubmit: boolean;
  isLocked: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (amendmentReason?: string) => Promise<any>;
  steps: StepConfig[];
  onStepClick: (index: number) => void;
}

const MODULE_LABELS: Record<keyof CompletionState, string> = {
  revenue: 'Revenue',
  comps: 'Comps',
  labor: 'Labor',
  incidents: 'Incidents',
  coaching: 'Coaching',
  entertainment: 'Entertainment',
  culinary: 'Culinary',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'complete') return <CheckCircle2 className="h-4 w-4 text-sage" />;
  if (status === 'incomplete') return <XCircle className="h-4 w-4 text-error" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export function ReviewStep({
  attestation,
  triggers,
  compResolutions,
  incidents,
  coachingActions,
  completionState,
  canSubmit,
  isLocked,
  submitting,
  error,
  onSubmit,
  steps,
  onStepClick,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-brass" />
        <h3 className="text-lg font-semibold">Review & Submit</h3>
      </div>

      {/* Module status list */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            {Object.entries(completionState).map(([key, status]) => {
              const moduleKey = key as keyof CompletionState;
              // Find matching step index for navigation
              const stepIndex = steps.findIndex(s => s.id === key);

              return (
                <button
                  key={key}
                  onClick={() => stepIndex >= 0 && onStepClick(stepIndex)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                >
                  <StatusIcon status={status} />
                  <span className="text-sm font-medium flex-1">{MODULE_LABELS[moduleKey]}</span>

                  {/* Summary text */}
                  <span className="text-xs text-muted-foreground">
                    {key === 'revenue' && attestation?.revenue_confirmed === true && 'Confirmed'}
                    {key === 'revenue' && attestation?.revenue_variance_reason &&
                      REVENUE_VARIANCE_LABELS[attestation.revenue_variance_reason as RevenueVarianceReason]}
                    {key === 'labor' && attestation?.labor_confirmed === true && 'Confirmed'}
                    {key === 'labor' && attestation?.labor_variance_reason &&
                      LABOR_VARIANCE_LABELS[attestation.labor_variance_reason as LaborVarianceReason]}
                    {key === 'comps' && compResolutions.length > 0 &&
                      `${compResolutions.length} resolved`}
                    {key === 'incidents' && incidents.length > 0 &&
                      `${incidents.length} logged`}
                    {key === 'coaching' && coachingActions.length > 0 &&
                      `${coachingActions.length} action${coachingActions.length !== 1 ? 's' : ''}`}
                    {key === 'entertainment' && status === 'complete' && 'Rated'}
                    {key === 'culinary' && status === 'complete' && 'Rated'}
                    {status === 'not_required' && 'Not required'}
                    {status === 'always_optional' && coachingActions.length === 0 && 'Optional'}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected driver tags */}
      {((attestation?.revenue_tags && attestation.revenue_tags.length > 0) ||
        (attestation?.labor_tags && attestation.labor_tags.length > 0) ||
        (attestation?.comp_tags && attestation.comp_tags.length > 0) ||
        (attestation?.incident_tags && attestation.incident_tags.length > 0) ||
        (attestation?.coaching_tags && attestation.coaching_tags.length > 0) ||
        (attestation?.entertainment_tags && attestation.entertainment_tags.length > 0) ||
        (attestation?.culinary_tags && attestation.culinary_tags.length > 0)) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {attestation?.revenue_tags && attestation.revenue_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Revenue Drivers</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.revenue_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {REVENUE_TAG_LABELS[tag as RevenueTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attestation?.labor_tags && attestation.labor_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Labor Drivers</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.labor_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {LABOR_TAG_LABELS[tag as LaborTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attestation?.comp_tags && attestation.comp_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Comp Drivers</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.comp_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {COMP_TAG_LABELS[tag as CompTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attestation?.incident_tags && attestation.incident_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Incident Drivers</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.incident_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {INCIDENT_TAG_LABELS[tag as IncidentTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attestation?.coaching_tags && attestation.coaching_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Coaching Focus</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.coaching_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {COACHING_TAG_LABELS[tag as CoachingTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attestation?.entertainment_tags && attestation.entertainment_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Entertainment</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.entertainment_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {ENTERTAINMENT_TAG_LABELS[tag as EntertainmentTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attestation?.culinary_tags && attestation.culinary_tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Culinary</h4>
                <div className="flex flex-wrap gap-1">
                  {attestation.culinary_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass rounded">
                      {CULINARY_TAG_LABELS[tag as CulinaryTag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comp resolution detail */}
      {compResolutions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold mb-2">Comp Resolutions</h4>
            <div className="space-y-1">
              {compResolutions.map((r) => (
                <div key={r.id || r.check_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-sage shrink-0" />
                  <span>#{r.check_id}</span>
                  <span className="font-medium text-foreground">
                    {COMP_RESOLUTION_LABELS[r.resolution_code as CompResolutionCode]}
                  </span>
                  {r.requires_follow_up && (
                    <span className="px-1.5 py-0.5 bg-error/10 text-error rounded text-[10px]">Follow-up</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="bg-error/5 border border-error/30 rounded-md p-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Submit / Locked / Amend */}
      {isLocked && !showAmend ? (
        <div className="border border-sage/40 rounded-md p-4 bg-sage/5">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-sage" />
            <div className="flex-1">
              <div className="text-sm font-medium text-sage">
                Attestation {attestation?.status === 'amended' ? 'Amended' : 'Submitted'}
              </div>
              <div className="text-xs text-muted-foreground">
                {attestation?.submitted_at && new Date(attestation.submitted_at).toLocaleString()}
                {attestation?.amendment_reason && (
                  <span className="ml-2">— Amendment: {attestation.amendment_reason}</span>
                )}
              </div>
            </div>
            {actionsCreated != null && actionsCreated > 0 && (
              <span className="text-xs text-brass">{actionsCreated} action{actionsCreated !== 1 ? 's' : ''} created</span>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowAmend(true)}>
              Amend
            </Button>
          </div>
        </div>
      ) : showAmend ? (
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
            <Button variant="ghost" size="sm" onClick={() => setShowAmend(false)}>Cancel</Button>
            <Button
              variant="brass"
              size="sm"
              onClick={handleAmend}
              disabled={!amendReason.trim() || submitting}
            >
              {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Amending...</> : 'Submit Amendment'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border border-brass/30 rounded-md p-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {requiredModules.length === 0 ? (
                'No modules required — submit when ready'
              ) : (
                <>{completedCount} of {requiredModules.length} required module{requiredModules.length !== 1 ? 's' : ''} complete</>
              )}
            </div>
            <Button
              variant="brass"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
              ) : (
                <><Lock className="h-4 w-4 mr-2" />Submit & Lock</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
