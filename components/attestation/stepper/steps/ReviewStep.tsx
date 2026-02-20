'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  XCircle,
  Lock,
  Loader2,
  ClipboardCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import type { NightlyAttestation, TriggerResult, CompResolution, NightlyIncident, CoachingAction } from '@/lib/attestation/types';
import type { CompletionState } from '@/components/attestation/useAttestation';
import {
  COMP_RESOLUTION_LABELS,
  type CompResolutionCode,
} from '@/lib/attestation/types';
import type { StepConfig } from '../StepIndicator';
import type { ShiftLog } from '@/lib/entertainment/types';
import type { CulinaryShiftLog } from '@/lib/culinary/types';

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
  // Context for closing narrative
  reportSummary: { net_sales: number; total_covers: number; total_comps: number } | null;
  factsSummary: {
    food_sales?: number;
    beverage_sales?: number;
    beverage_pct?: number;
    forecast?: { net_sales: number | null; covers: number | null } | null;
    variance?: {
      vs_forecast_pct: number | null;
      vs_sdlw_pct: number | null;
      vs_sdly_pct: number | null;
    } | null;
    labor?: {
      total_hours: number;
      labor_cost: number;
      labor_pct: number;
      splh: number;
      ot_hours: number;
      employee_count: number;
      covers_per_labor_hour: number | null;
      foh: { hours: number; cost: number; employee_count: number } | null;
      boh: { hours: number; cost: number; employee_count: number } | null;
      other: { hours: number; cost: number; employee_count: number } | null;
    } | null;
  } | null;
  compExceptions: {
    summary: {
      total_comps: number;
      net_sales: number;
      comp_pct: number;
      comp_pct_status: 'ok' | 'warning' | 'critical';
      exception_count: number;
      critical_count: number;
      warning_count: number;
    };
    exceptions: any[];
  } | null;
  healthData: { health_score: number; status: string } | null;
  venueId: string | undefined;
  venueName: string;
  date: string;
  shiftLog: ShiftLog | null;
  culinaryLog: CulinaryShiftLog | null;
  notableGuests?: Array<{
    check_id: string;
    server: string;
    covers: number;
    payment: number;
    table_name: string;
    cardholder_name: string | null;
    tip_percent: number | null;
    items: string[];
  }>;
  peopleWeKnow?: Array<{
    first_name: string;
    last_name: string;
    is_vip: boolean;
    tags: string[] | null;
    party_size: number;
    total_payment: number;
    status: string;
  }>;
  updateField: (fields: Partial<NightlyAttestation>) => void;
}

const MODULE_LABELS: Record<keyof CompletionState, string> = {
  revenue: 'Revenue',
  comps: 'Comps',
  labor: 'Labor',
  incidents: 'Incidents',
  coaching: 'Coaching',
  guest: 'Guest',
  entertainment: 'Entertainment',
  culinary: 'Culinary',
};

function StatusIcon({ status }: { status: 'complete' | 'incomplete' }) {
  if (status === 'complete') return <CheckCircle2 className="h-4 w-4 text-sage" />;
  return <XCircle className="h-4 w-4 text-error" />;
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
  reportSummary,
  factsSummary,
  compExceptions,
  healthData,
  venueName,
  date,
  notableGuests = [],
  peopleWeKnow = [],
  updateField,
}: Props) {
  const [showAmend, setShowAmend] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [actionsCreated, setActionsCreated] = useState<number | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

  const allModules = Object.entries(completionState);
  const completedCount = allModules.filter(([, v]) => v === 'complete').length;

  // ---------------------------------------------------------------------------
  // Closing narrative generation
  // ---------------------------------------------------------------------------
  const generateNarrative = useCallback(async () => {
    if (!attestation || !reportSummary) return;

    setNarrativeLoading(true);
    setNarrativeError(null);

    try {
      const avgCheck =
        reportSummary.total_covers > 0
          ? reportSummary.net_sales / reportSummary.total_covers
          : 0;

      const res = await fetch('/api/ai/closing-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date,
          venueName,
          // Raw data
          net_sales: reportSummary.net_sales,
          total_covers: reportSummary.total_covers,
          avg_check: avgCheck,
          food_sales: factsSummary?.food_sales ?? 0,
          beverage_sales: factsSummary?.beverage_sales ?? 0,
          beverage_pct: factsSummary?.beverage_pct ?? 0,
          forecast_net_sales: factsSummary?.forecast?.net_sales ?? null,
          vs_forecast_pct: factsSummary?.variance?.vs_forecast_pct ?? null,
          vs_sdlw_pct: factsSummary?.variance?.vs_sdlw_pct ?? null,
          vs_sdly_pct: factsSummary?.variance?.vs_sdly_pct ?? null,
          labor_cost: factsSummary?.labor?.labor_cost ?? 0,
          labor_pct: factsSummary?.labor?.labor_pct ?? 0,
          splh: factsSummary?.labor?.splh ?? 0,
          ot_hours: factsSummary?.labor?.ot_hours ?? 0,
          total_labor_hours: factsSummary?.labor?.total_hours ?? 0,
          employee_count: factsSummary?.labor?.employee_count ?? 0,
          total_comps: reportSummary.total_comps,
          comp_pct: compExceptions?.summary?.comp_pct ?? 0,
          comp_exception_count: compExceptions?.summary?.exception_count ?? 0,
          health_score: healthData?.health_score ?? null,
          // Manager inputs — revenue (structured prompts)
          revenue_driver: attestation.revenue_driver ?? null,
          revenue_mgmt_impact: attestation.revenue_mgmt_impact ?? null,
          revenue_lost_opportunity: attestation.revenue_lost_opportunity ?? null,
          revenue_demand_signal: attestation.revenue_demand_signal ?? null,
          revenue_quality: attestation.revenue_quality ?? null,
          revenue_action: attestation.revenue_action ?? null,
          revenue_tags: attestation.revenue_tags ?? [],
          revenue_notes: attestation.revenue_notes ?? null,
          // Comp structured prompts
          comp_driver: attestation.comp_driver ?? null,
          comp_pattern: attestation.comp_pattern ?? null,
          comp_compliance: attestation.comp_compliance ?? null,
          comp_tags: attestation.comp_tags ?? [],
          comp_notes: attestation.comp_notes ?? null,
          comp_acknowledged: attestation.comp_acknowledged ?? false,
          // Labor structured prompts
          labor_foh_coverage: attestation.labor_foh_coverage ?? null,
          labor_boh_performance: attestation.labor_boh_performance ?? null,
          labor_decision: attestation.labor_decision ?? null,
          labor_change: attestation.labor_change ?? null,
          labor_tags: attestation.labor_tags ?? [],
          labor_notes: attestation.labor_notes ?? null,
          labor_foh_notes: attestation.labor_foh_notes ?? null,
          labor_boh_notes: attestation.labor_boh_notes ?? null,
          labor_acknowledged: attestation.labor_acknowledged ?? false,
          comp_resolutions: compResolutions.map((r) => ({
            check_id: r.check_id,
            resolution_code: r.resolution_code,
            notes: r.resolution_notes,
          })),
          incident_tags: attestation.incident_tags ?? [],
          incident_notes: attestation.incident_notes ?? null,
          incidents_acknowledged: attestation.incidents_acknowledged ?? false,
          incidents: incidents.map((i) => ({
            category: i.incident_type,
            severity: i.severity,
            description: i.description,
          })),
          // Coaching structured prompts (FOH + BOH + shared)
          coaching_foh_standout: attestation.coaching_foh_standout ?? null,
          coaching_foh_development: attestation.coaching_foh_development ?? null,
          coaching_boh_standout: attestation.coaching_boh_standout ?? null,
          coaching_boh_development: attestation.coaching_boh_development ?? null,
          coaching_team_focus: attestation.coaching_team_focus ?? null,
          coaching_tags: attestation.coaching_tags ?? [],
          coaching_notes: attestation.coaching_notes ?? null,
          coaching_acknowledged: attestation.coaching_acknowledged ?? false,
          coaching_actions: coachingActions.map((a) => ({
            employee_name: a.employee_name,
            action_type: a.coaching_type,
            description: a.reason,
          })),
          top_spenders: notableGuests.map(g => ({
            server: g.server,
            covers: g.covers,
            payment: g.payment,
            table_name: g.table_name,
            cardholder_name: g.cardholder_name,
            items: g.items,
          })),
          known_vips: peopleWeKnow.map(v => ({
            name: `${v.first_name} ${v.last_name}`.trim(),
            is_vip: v.is_vip,
            party_size: v.party_size,
            total_payment: v.total_payment,
          })),
          // Guest structured prompts
          guest_vip_notable: attestation.guest_vip_notable ?? null,
          guest_experience: attestation.guest_experience ?? null,
          guest_opportunity: attestation.guest_opportunity ?? null,
          guest_tags: attestation.guest_tags ?? [],
          guest_notes: attestation.guest_notes ?? null,
          guest_acknowledged: attestation.guest_acknowledged ?? false,
          entertainment_tags: attestation.entertainment_tags ?? [],
          entertainment_notes: attestation.entertainment_notes ?? null,
          culinary_tags: attestation.culinary_tags ?? [],
          culinary_notes: attestation.culinary_notes ?? null,
          trigger_reasons: [
            ...(triggers?.revenue_triggers ?? []),
            ...(triggers?.labor_triggers ?? []),
            ...(triggers?.incident_triggers ?? []),
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate closing summary');
      }

      const data = await res.json();
      updateField({ closing_narrative: data.narrative });
    } catch (err: any) {
      setNarrativeError(err.message || 'Failed to generate closing summary');
    } finally {
      setNarrativeLoading(false);
    }
  }, [
    attestation,
    reportSummary,
    factsSummary,
    compExceptions,
    healthData,
    compResolutions,
    incidents,
    coachingActions,
    notableGuests,
    peopleWeKnow,
    triggers,
    date,
    venueName,
    updateField,
  ]);

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

  const hasNarrative = !!attestation?.closing_narrative;

  // Helper: count how many structured prompts are filled for a module
  function promptsFilledCount(keys: readonly string[]): number {
    return keys.filter(k => ((attestation?.[k as keyof NightlyAttestation] as string)?.length ?? 0) >= 20).length;
  }

  // Helper: build summary text for each module row
  function moduleSummary(key: string): string {
    switch (key) {
      case 'revenue': {
        const filled = promptsFilledCount(['revenue_driver', 'revenue_mgmt_impact', 'revenue_lost_opportunity', 'revenue_demand_signal', 'revenue_quality', 'revenue_action']);
        return filled > 0 ? `${filled}/6 prompts` : '';
      }
      case 'comps': {
        const parts: string[] = [];
        const filled = promptsFilledCount(['comp_driver', 'comp_pattern', 'comp_compliance']);
        if (filled > 0) parts.push(`${filled}/3 prompts`);
        if (compResolutions.length > 0) parts.push(`${compResolutions.length} resolved`);
        if (attestation?.comp_acknowledged && filled === 0) parts.push('Acknowledged');
        return parts.join(', ');
      }
      case 'labor': {
        const filled = promptsFilledCount(['labor_foh_coverage', 'labor_boh_performance', 'labor_decision', 'labor_change']);
        if (filled > 0) return `${filled}/4 prompts`;
        if (attestation?.labor_acknowledged) return 'Acknowledged';
        return '';
      }
      case 'incidents': {
        const parts: string[] = [];
        if ((attestation?.incident_notes?.length ?? 0) >= 10) parts.push('Noted');
        if (incidents.length > 0) parts.push(`${incidents.length} logged`);
        if (attestation?.incidents_acknowledged && (attestation?.incident_notes?.length ?? 0) < 10) parts.push('Acknowledged');
        return parts.join(', ');
      }
      case 'coaching': {
        const parts: string[] = [];
        const filled = promptsFilledCount(['coaching_foh_standout', 'coaching_foh_development', 'coaching_boh_standout', 'coaching_boh_development', 'coaching_team_focus']);
        if (filled > 0) parts.push(`${filled}/5 prompts`);
        if (coachingActions.length > 0)
          parts.push(`${coachingActions.length} action${coachingActions.length !== 1 ? 's' : ''}`);
        if (attestation?.coaching_acknowledged && filled === 0) parts.push('Acknowledged');
        return parts.join(', ');
      }
      case 'guest': {
        const parts: string[] = [];
        const filled = promptsFilledCount(['guest_vip_notable', 'guest_experience', 'guest_opportunity']);
        if (filled > 0) parts.push(`${filled}/3 prompts`);
        if (attestation?.guest_acknowledged && filled === 0) parts.push('Acknowledged');
        return parts.join(', ');
      }
      case 'entertainment':
        return completionState.entertainment === 'complete' ? 'Rated' : '';
      case 'culinary':
        return completionState.culinary === 'complete' ? 'Rated' : '';
      default:
        return '';
    }
  }

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
            {allModules.map(([key, status]) => {
              const moduleKey = key as keyof CompletionState;
              const stepIndex = steps.findIndex((s) => s.id === key);
              const summary = moduleSummary(key);

              return (
                <button
                  key={key}
                  onClick={() => stepIndex >= 0 && onStepClick(stepIndex)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                >
                  <StatusIcon status={status} />
                  <span className="text-sm font-medium flex-1">{MODULE_LABELS[moduleKey]}</span>
                  {summary && (
                    <span className="text-xs text-muted-foreground">{summary}</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Manager narratives summary */}
      {(attestation?.revenue_notes || attestation?.labor_foh_notes || attestation?.labor_boh_notes ||
        attestation?.comp_notes || attestation?.incident_notes || attestation?.coaching_notes ||
        attestation?.guest_notes || attestation?.entertainment_notes || attestation?.culinary_notes) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {attestation?.revenue_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Revenue</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.revenue_notes}</p>
              </div>
            )}
            {(attestation?.labor_foh_notes || attestation?.labor_boh_notes) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Labor</h4>
                {attestation?.labor_foh_notes && (
                  <p className="text-sm text-foreground/80 line-clamp-2"><span className="text-xs font-medium text-muted-foreground">FOH:</span> {attestation.labor_foh_notes}</p>
                )}
                {attestation?.labor_boh_notes && (
                  <p className="text-sm text-foreground/80 line-clamp-2 mt-1"><span className="text-xs font-medium text-muted-foreground">BOH:</span> {attestation.labor_boh_notes}</p>
                )}
              </div>
            )}
            {attestation?.comp_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Comps</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.comp_notes}</p>
              </div>
            )}
            {attestation?.incident_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Incidents</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.incident_notes}</p>
              </div>
            )}
            {attestation?.coaching_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Coaching</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.coaching_notes}</p>
              </div>
            )}
            {attestation?.guest_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Guest</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.guest_notes}</p>
              </div>
            )}
            {attestation?.entertainment_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Entertainment</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.entertainment_notes}</p>
              </div>
            )}
            {attestation?.culinary_notes && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Culinary</h4>
                <p className="text-sm text-foreground/80 line-clamp-2">{attestation.culinary_notes}</p>
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

      {/* AI Closing Summary */}
      {!isLocked && (
        <Card className="border-brass/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brass" />
                <h4 className="text-sm font-semibold">AI Closing Summary</h4>
              </div>
              {hasNarrative && !narrativeLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateNarrative}
                  className="h-7 text-xs text-muted-foreground"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              )}
            </div>

            {narrativeLoading ? (
              <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating closing summary...
              </div>
            ) : hasNarrative ? (
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {attestation!.closing_narrative}
              </p>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Generate an AI-powered closing summary that synthesizes tonight's data with your attestation inputs.
                </p>
                <Button
                  variant="brass"
                  size="sm"
                  onClick={generateNarrative}
                  disabled={!reportSummary}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Generate Closing Summary
                </Button>
              </div>
            )}

            {narrativeError && (
              <div className="text-xs text-error bg-error/5 border border-error/20 rounded-md px-3 py-2">
                {narrativeError}
              </div>
            )}

            {!hasNarrative && !narrativeLoading && (
              <p className="text-[11px] text-muted-foreground text-center">
                Required before submission
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Show saved narrative on locked attestations */}
      {isLocked && attestation?.closing_narrative && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brass" />
              <h4 className="text-sm font-semibold">Closing Summary</h4>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {attestation.closing_narrative}
            </p>
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
              {completedCount} of {allModules.length} modules complete
              {completedCount === allModules.length && !hasNarrative && (
                <span className="block text-xs mt-0.5">Generate closing summary to submit</span>
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
