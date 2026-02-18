'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  DollarSign,
  ShieldAlert,
  Clock,
  AlertOctagon,
  Users,
  ClipboardCheck,
} from 'lucide-react';
import { StepIndicator, type StepConfig } from './StepIndicator';
import { StepNavigation } from './StepNavigation';
import { RevenueStep } from './steps/RevenueStep';
import { CompsStep } from './steps/CompsStep';
import { LaborStep } from './steps/LaborStep';
import { IncidentsStep } from './steps/IncidentsStep';
import { CoachingStep } from './steps/CoachingStep';
import { ReviewStep } from './steps/ReviewStep';
import type {
  NightlyAttestation,
  TriggerResult,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';
import type { CompletionState } from '@/components/attestation/useAttestation';

// ---------------------------------------------------------------------------
// Report data types passed in from the nightly page
// ---------------------------------------------------------------------------
interface ReportSummary {
  net_sales: number;
  total_covers: number;
  total_comps: number;
}

interface FactsSummary {
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
    covers_per_labor_hour: number | null;
    employee_count: number;
    foh: { hours: number; cost: number; employee_count: number } | null;
    boh: { hours: number; cost: number; employee_count: number } | null;
    other: { hours: number; cost: number; employee_count: number } | null;
  } | null;
}

interface CompExceptionsData {
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
}

interface CompReviewData {
  summary: {
    totalReviewed: number;
    approved: number;
    needsFollowup: number;
    urgent: number;
    overallAssessment: string;
  };
  recommendations: any[];
  insights: string[];
}

interface HealthData {
  health_score: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface AttestationStepperProps {
  open: boolean;
  onClose: () => void;

  // Report context (read-only)
  reportSummary: ReportSummary | null;
  factsSummary: FactsSummary | null;
  compExceptions: CompExceptionsData | null;
  compReview: CompReviewData | null;
  laborExceptions: any | null;
  healthData: HealthData | null;

  // Venue ID for narrative generation
  venueId: string | undefined;

  // Attestation state
  attestation: NightlyAttestation | null;
  triggers: TriggerResult | null;
  compResolutions: CompResolution[];
  incidents: NightlyIncident[];
  coachingActions: CoachingAction[];
  completionState: CompletionState;
  canSubmit: boolean;
  isLocked: boolean;
  loading: boolean;
  saving: boolean;
  submitting: boolean;
  error: string | null;

  // Mutation callbacks
  updateField: (fields: Partial<NightlyAttestation>) => void;
  addCompResolution: (resolution: any) => Promise<void>;
  addIncident: (incident: any) => Promise<void>;
  addCoaching: (coaching: any) => Promise<void>;
  submitAttestation: (amendmentReason?: string) => Promise<any>;

  // Metadata
  date: string;
  venueName: string;
}

export function AttestationStepper({
  open,
  onClose,
  reportSummary,
  factsSummary,
  compExceptions,
  compReview,
  laborExceptions,
  healthData,
  venueId,
  attestation,
  triggers,
  compResolutions,
  incidents,
  coachingActions,
  completionState,
  canSubmit,
  isLocked,
  loading,
  saving,
  submitting,
  error,
  updateField,
  addCompResolution,
  addIncident,
  addCoaching,
  submitAttestation,
  date,
  venueName,
}: AttestationStepperProps) {
  // Build step configs
  const steps: StepConfig[] = useMemo(() => [
    {
      id: 'revenue',
      label: 'Revenue',
      icon: DollarSign,
      status: triggers?.revenue_attestation_required ? 'required' : 'not_required',
      completion: completionState.revenue,
    },
    {
      id: 'comps',
      label: 'Comps',
      icon: ShieldAlert,
      status: triggers?.comp_resolution_required ? 'required' : 'not_required',
      completion: completionState.comps,
    },
    {
      id: 'labor',
      label: 'Labor',
      icon: Clock,
      status: triggers?.labor_attestation_required ? 'required' : 'not_required',
      completion: completionState.labor,
    },
    {
      id: 'incidents',
      label: 'Incidents',
      icon: AlertOctagon,
      status: triggers?.incident_log_required ? 'required' : 'not_required',
      completion: completionState.incidents,
    },
    {
      id: 'coaching',
      label: 'Coaching',
      icon: Users,
      status: 'optional' as const,
      completion: completionState.coaching,
    },
    {
      id: 'review',
      label: 'Review',
      icon: ClipboardCheck,
      status: 'required' as const,
      completion: canSubmit || isLocked ? 'complete' as const : 'incomplete' as const,
    },
  ], [triggers, completionState, canSubmit, isLocked]);

  // Smart start: first incomplete required step
  const initialStep = useMemo(() => {
    if (isLocked) return steps.length - 1; // Go to review if already submitted
    const firstIncomplete = steps.findIndex(
      s => s.status === 'required' && s.completion === 'incomplete',
    );
    return firstIncomplete >= 0 ? firstIncomplete : 0;
  }, [steps, isLocked]);

  const [currentStep, setCurrentStep] = useState(initialStep);

  // Reset step when Sheet opens
  useEffect(() => {
    if (open) {
      setCurrentStep(initialStep);
    }
  }, [open, initialStep]);

  // ---------------------------------------------------------------------------
  // AI Narrative — lazy fetch when stepper opens with data available
  // ---------------------------------------------------------------------------
  const [narratives, setNarratives] = useState<{ revenue_narrative: string; labor_narrative: string } | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  useEffect(() => {
    if (!open || !venueId || !reportSummary || !date) return;
    // Already fetched for this session
    if (narratives) return;

    let cancelled = false;
    setNarrativeLoading(true);

    const body = {
      date,
      venueName,
      net_sales: reportSummary.net_sales,
      total_covers: reportSummary.total_covers,
      total_comps: reportSummary.total_comps,
      avg_check: reportSummary.total_covers > 0
        ? reportSummary.net_sales / reportSummary.total_covers
        : 0,
      food_sales: factsSummary?.food_sales ?? 0,
      beverage_sales: factsSummary?.beverage_sales ?? 0,
      beverage_pct: factsSummary?.beverage_pct ?? 0,
      comp_pct: reportSummary.net_sales > 0
        ? (reportSummary.total_comps / reportSummary.net_sales) * 100
        : 0,
      forecast_net_sales: factsSummary?.forecast?.net_sales ?? null,
      forecast_covers: factsSummary?.forecast?.covers ?? null,
      vs_forecast_pct: factsSummary?.variance?.vs_forecast_pct ?? null,
      vs_sdlw_pct: factsSummary?.variance?.vs_sdlw_pct ?? null,
      vs_sdly_pct: factsSummary?.variance?.vs_sdly_pct ?? null,
      // Labor
      labor_cost: factsSummary?.labor?.labor_cost ?? 0,
      labor_pct: factsSummary?.labor?.labor_pct ?? 0,
      total_hours: factsSummary?.labor?.total_hours ?? 0,
      splh: factsSummary?.labor?.splh ?? 0,
      ot_hours: factsSummary?.labor?.ot_hours ?? 0,
      covers_per_labor_hour: factsSummary?.labor?.covers_per_labor_hour ?? null,
      employee_count: factsSummary?.labor?.employee_count ?? 0,
    };

    fetch('/api/ai/attestation-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.narratives) {
          setNarratives(data.narratives);
        }
      })
      .catch(() => { /* silent — narrative is supplemental */ })
      .finally(() => { if (!cancelled) setNarrativeLoading(false); });

    return () => { cancelled = true; };
  }, [open, venueId, reportSummary, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmitAndClose = async (amendmentReason?: string) => {
    const result = await submitAttestation(amendmentReason);
    if (result?.success) {
      // Small delay so user sees the success state
      setTimeout(() => onClose(), 800);
    }
    return result;
  };

  const isLastStep = currentStep === steps.length - 1;
  const activeStep = steps[currentStep];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">Nightly Attestation</SheetTitle>
        <SheetDescription className="sr-only">
          Step-by-step attestation for {venueName} on {date}
        </SheetDescription>

        {/* Header: Step indicator */}
        <div className="shrink-0">
          <div className="px-6 pt-4 pb-2">
            <div className="text-xs text-muted-foreground">
              {venueName} — {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })}
            </div>
          </div>
          <StepIndicator
            steps={steps}
            currentStep={currentStep}
            onStepClick={setCurrentStep}
          />
        </div>

        {/* Body: Active step */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading attestation...
            </div>
          ) : !attestation ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No attestation data available
            </div>
          ) : (
            <>
              {activeStep.id === 'revenue' && (
                <RevenueStep
                  triggers={triggers}
                  attestation={attestation}
                  onUpdate={updateField}
                  disabled={isLocked}
                  netSales={reportSummary?.net_sales ?? 0}
                  totalCovers={reportSummary?.total_covers ?? 0}
                  totalComps={reportSummary?.total_comps ?? 0}
                  forecast={factsSummary?.forecast}
                  variance={factsSummary?.variance}
                  foodSales={factsSummary?.food_sales}
                  beverageSales={factsSummary?.beverage_sales}
                  beveragePct={factsSummary?.beverage_pct}
                  narrative={narratives?.revenue_narrative}
                  narrativeLoading={narrativeLoading}
                />
              )}
              {activeStep.id === 'comps' && (
                <CompsStep
                  triggers={triggers}
                  resolutions={compResolutions}
                  onAdd={addCompResolution}
                  disabled={isLocked}
                  totalComps={reportSummary?.total_comps ?? 0}
                  netSales={reportSummary?.net_sales ?? 0}
                  exceptionSummary={compExceptions?.summary ?? null}
                  reviewSummary={compReview?.summary ?? null}
                />
              )}
              {activeStep.id === 'labor' && (
                <LaborStep
                  triggers={triggers}
                  attestation={attestation}
                  onUpdate={updateField}
                  disabled={isLocked}
                  labor={factsSummary?.labor ?? null}
                  netSales={reportSummary?.net_sales ?? 0}
                  covers={reportSummary?.total_covers ?? 0}
                  laborExceptions={laborExceptions}
                  narrative={narratives?.labor_narrative}
                  narrativeLoading={narrativeLoading}
                />
              )}
              {activeStep.id === 'incidents' && (
                <IncidentsStep
                  triggers={triggers}
                  incidents={incidents}
                  onAdd={addIncident}
                  disabled={isLocked}
                  healthScore={healthData?.health_score}
                  healthStatus={healthData?.status}
                />
              )}
              {activeStep.id === 'coaching' && (
                <CoachingStep
                  actions={coachingActions}
                  onAdd={addCoaching}
                  disabled={isLocked}
                />
              )}
              {activeStep.id === 'review' && (
                <ReviewStep
                  attestation={attestation}
                  triggers={triggers}
                  compResolutions={compResolutions}
                  incidents={incidents}
                  coachingActions={coachingActions}
                  completionState={completionState}
                  canSubmit={canSubmit}
                  isLocked={isLocked}
                  submitting={submitting}
                  error={error}
                  onSubmit={handleSubmitAndClose}
                  steps={steps}
                  onStepClick={setCurrentStep}
                />
              )}
            </>
          )}
        </div>

        {/* Footer: Navigation */}
        <div className="shrink-0">
          <StepNavigation
            currentStep={currentStep}
            totalSteps={steps.length}
            onBack={handleBack}
            onNext={handleNext}
            saving={saving}
            isLastStep={isLastStep}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
