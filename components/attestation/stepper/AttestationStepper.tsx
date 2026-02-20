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
  Crown,
  Music,
  ChefHat,
  ClipboardCheck,
} from 'lucide-react';
import { StepIndicator, type StepConfig } from './StepIndicator';
import { StepNavigation } from './StepNavigation';
import { RevenueStep } from './steps/RevenueStep';
import { CompsStep } from './steps/CompsStep';
import { LaborStep } from './steps/LaborStep';
import { IncidentsStep } from './steps/IncidentsStep';
import { CoachingStep } from './steps/CoachingStep';
import { EntertainmentStep } from './steps/EntertainmentStep';
import { GuestStep } from './steps/GuestStep';
import { CulinaryStep } from './steps/CulinaryStep';
import { ReviewStep } from './steps/ReviewStep';
import type {
  NightlyAttestation,
  TriggerResult,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';
import type { ShiftLog } from '@/lib/entertainment/types';
import type { CulinaryShiftLog } from '@/lib/culinary/types';
import type { CompletionState } from '@/components/attestation/useAttestation';

// ---------------------------------------------------------------------------
// Report data types passed in from the nightly page
// ---------------------------------------------------------------------------
interface ReportSummary {
  net_sales: number;
  total_covers: number;
  total_comps: number;
  total_checks?: number;
  total_voids?: number;
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
    vs_forecast_covers_pct?: number | null;
    vs_sdlw_covers_pct?: number | null;
    vs_sdly_covers_pct?: number | null;
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

  // Venue ID
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

  // Guest / VIP data (auto-surfaced from TipSee)
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

  // Comp category breakdown (from TipSee report.discounts)
  compsByReason?: Array<{ reason: string; qty: number; amount: number }>;

  // Top items and server performance (from TipSee, for closing narrative)
  topItems?: Array<{ name: string; revenue: number; quantity: number }>;
  serverPerformance?: Array<{
    name: string;
    net_sales: number;
    covers: number;
    checks: number;
    avg_check: number;
    tip_pct: number;
  }>;
  discountsTotal?: number;

  // Entertainment (all h.wood venues)
  hasEntertainment?: boolean;
  // Culinary (all h.wood venues with kitchen)
  hasCulinary?: boolean;
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
  notableGuests = [],
  peopleWeKnow = [],
  compsByReason = [],
  topItems = [],
  serverPerformance = [],
  discountsTotal = 0,
  hasEntertainment = true,
  hasCulinary = true,
}: AttestationStepperProps) {
  // ---------------------------------------------------------------------------
  // Entertainment shift log — fetch when stepper opens
  // ---------------------------------------------------------------------------
  const [shiftLog, setShiftLog] = useState<ShiftLog | null>(null);

  useEffect(() => {
    if (!open || !venueId || !date || !hasEntertainment) return;
    let cancelled = false;

    fetch(`/api/entertainment/shift-logs?venue_id=${venueId}&business_date=${date}`, {
      credentials: 'include',
    })
      .then(res => res.ok ? res.json() : [])
      .then(logs => {
        if (!cancelled) {
          setShiftLog(Array.isArray(logs) && logs.length > 0 ? logs[0] : null);
        }
      })
      .catch(() => { if (!cancelled) setShiftLog(null); });

    return () => { cancelled = true; };
  }, [open, venueId, date, hasEntertainment]);

  const entertainmentComplete = !!shiftLog?.overall_rating;

  // ---------------------------------------------------------------------------
  // Culinary shift log — fetch when stepper opens
  // ---------------------------------------------------------------------------
  const [culinaryLog, setCulinaryLog] = useState<CulinaryShiftLog | null>(null);

  useEffect(() => {
    if (!open || !venueId || !date || !hasCulinary) return;
    let cancelled = false;

    fetch(`/api/culinary/shift-logs?venue_id=${venueId}&business_date=${date}`, {
      credentials: 'include',
    })
      .then(res => res.ok ? res.json() : [])
      .then(logs => {
        if (!cancelled) {
          setCulinaryLog(Array.isArray(logs) && logs.length > 0 ? logs[0] : null);
        }
      })
      .catch(() => { if (!cancelled) setCulinaryLog(null); });

    return () => { cancelled = true; };
  }, [open, venueId, date, hasCulinary]);

  const culinaryComplete = !!culinaryLog?.overall_rating;

  // ---------------------------------------------------------------------------
  // Build step configs — all modules always required, flagged when triggered
  // ---------------------------------------------------------------------------
  const steps: StepConfig[] = useMemo(() => [
    {
      id: 'revenue',
      label: 'Revenue',
      icon: DollarSign,
      status: 'required' as const,
      completion: completionState.revenue,
      flagged: !!triggers?.revenue_attestation_required,
    },
    {
      id: 'comps',
      label: 'Comps',
      icon: ShieldAlert,
      status: 'required' as const,
      completion: completionState.comps,
      flagged: !!triggers?.comp_resolution_required,
    },
    {
      id: 'labor',
      label: 'Labor',
      icon: Clock,
      status: 'required' as const,
      completion: completionState.labor,
      flagged: !!triggers?.labor_attestation_required,
    },
    {
      id: 'incidents',
      label: 'Incidents',
      icon: AlertOctagon,
      status: 'required' as const,
      completion: completionState.incidents,
      flagged: !!triggers?.incident_log_required,
    },
    {
      id: 'coaching',
      label: 'Coaching',
      icon: Users,
      status: 'required' as const,
      completion: completionState.coaching,
    },
    {
      id: 'guest',
      label: 'Guest',
      icon: Crown,
      status: 'required' as const,
      completion: completionState.guest,
    },
    ...(hasEntertainment ? [{
      id: 'entertainment',
      label: 'Entertainment',
      icon: Music,
      status: 'required' as const,
      completion: entertainmentComplete ? 'complete' as const : 'incomplete' as const,
    }] : []),
    ...(hasCulinary ? [{
      id: 'culinary',
      label: 'Culinary',
      icon: ChefHat,
      status: 'required' as const,
      completion: culinaryComplete ? 'complete' as const : 'incomplete' as const,
    }] : []),
    {
      id: 'review',
      label: 'Review',
      icon: ClipboardCheck,
      status: 'required' as const,
      completion: (canSubmit && (!hasEntertainment || entertainmentComplete) && (!hasCulinary || culinaryComplete)) || isLocked
        ? 'complete' as const
        : 'incomplete' as const,
    },
  ], [triggers, completionState, canSubmit, isLocked, hasEntertainment, entertainmentComplete, hasCulinary, culinaryComplete]);

  // Derived completion state including entertainment + culinary
  const fullCompletionState: CompletionState = useMemo(() => ({
    ...completionState,
    entertainment: entertainmentComplete ? 'complete' : 'incomplete',
    culinary: culinaryComplete ? 'complete' : 'incomplete',
  }), [completionState, entertainmentComplete, culinaryComplete]);

  // Derived canSubmit including entertainment + culinary
  const fullCanSubmit = canSubmit && (!hasEntertainment || entertainmentComplete) && (!hasCulinary || culinaryComplete);

  // Smart start: first incomplete step
  const initialStep = useMemo(() => {
    if (isLocked) return steps.length - 1;
    const firstIncomplete = steps.findIndex(s => s.completion === 'incomplete');
    return firstIncomplete >= 0 ? firstIncomplete : 0;
  }, [steps, isLocked]);

  const [currentStep, setCurrentStep] = useState(initialStep);

  useEffect(() => {
    if (open) {
      setCurrentStep(initialStep);
    }
  }, [open, initialStep]);

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
                  foodSales={factsSummary?.food_sales || undefined}
                  beverageSales={factsSummary?.beverage_sales || undefined}
                  beveragePct={factsSummary?.beverage_pct}
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
                  compsByReason={compsByReason}
                  attestation={attestation}
                  onUpdate={updateField}
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
                />
              )}
              {activeStep.id === 'incidents' && (
                <IncidentsStep
                  triggers={triggers}
                  incidents={incidents}
                  onAdd={addIncident}
                  disabled={isLocked}
                  attestation={attestation}
                  onUpdate={updateField}
                />
              )}
              {activeStep.id === 'coaching' && (
                <CoachingStep
                  actions={coachingActions}
                  onAdd={addCoaching}
                  disabled={isLocked}
                  attestation={attestation}
                  onUpdate={updateField}
                />
              )}
              {activeStep.id === 'guest' && (
                <GuestStep
                  notableGuests={notableGuests}
                  peopleWeKnow={peopleWeKnow}
                  attestation={attestation}
                  onUpdate={updateField}
                  disabled={isLocked}
                />
              )}
              {activeStep.id === 'entertainment' && venueId && (
                <EntertainmentStep
                  venueId={venueId}
                  businessDate={date}
                  shiftLog={shiftLog}
                  onShiftLogUpdate={setShiftLog}
                  disabled={isLocked}
                  attestation={attestation}
                  onUpdate={updateField}
                />
              )}
              {activeStep.id === 'culinary' && venueId && (
                <CulinaryStep
                  venueId={venueId}
                  businessDate={date}
                  culinaryLog={culinaryLog}
                  onCulinaryLogUpdate={setCulinaryLog}
                  disabled={isLocked}
                  attestation={attestation}
                  onUpdate={updateField}
                />
              )}
              {activeStep.id === 'review' && (
                <ReviewStep
                  attestation={attestation}
                  triggers={triggers}
                  compResolutions={compResolutions}
                  incidents={incidents}
                  coachingActions={coachingActions}
                  completionState={fullCompletionState}
                  canSubmit={fullCanSubmit}
                  isLocked={isLocked}
                  submitting={submitting}
                  error={error}
                  onSubmit={handleSubmitAndClose}
                  steps={steps}
                  onStepClick={setCurrentStep}
                  reportSummary={reportSummary}
                  factsSummary={factsSummary}
                  compExceptions={compExceptions}
                  healthData={healthData}
                  venueId={venueId}
                  venueName={venueName}
                  date={date}
                  shiftLog={shiftLog}
                  culinaryLog={culinaryLog}
                  notableGuests={notableGuests}
                  peopleWeKnow={peopleWeKnow}
                  topItems={topItems}
                  serverPerformance={serverPerformance}
                  discountsTotal={discountsTotal}
                  updateField={updateField}
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
