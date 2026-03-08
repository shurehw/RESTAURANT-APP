'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DollarSign,
  ShieldAlert,
  UserCheck,
  ChefHat,
  AlertOctagon,
  Users,
  Crown,
  Sparkles,
  Lock,
  Loader2,
  Target,
  User,
  UtensilsCrossed,
  Lightbulb,
  Wrench,
  CalendarClock,
  Brain,
} from 'lucide-react';
import type {
  NightlyAttestation,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';
import {
  GUIDED_PROMPTS,
  REVENUE_PROMPT_KEYS,
  COMP_PROMPT_QUESTIONS,
  COMP_PROMPT_KEYS,
  FOH_PROMPT_QUESTIONS,
  FOH_PROMPT_KEYS,
  BOH_PROMPT_QUESTIONS,
  BOH_PROMPT_KEYS,
  COACHING_PROMPT_QUESTIONS,
  COACHING_PROMPT_KEYS,
  GUEST_PROMPT_QUESTIONS,
  GUEST_PROMPT_KEYS,
  REVENUE_TAG_LABELS,
  COMP_TAG_LABELS,
  LABOR_TAG_LABELS,
  INCIDENT_TAG_LABELS,
  COACHING_TAG_LABELS,
  GUEST_TAG_LABELS,
  COMP_RESOLUTION_LABELS,
  INCIDENT_TYPE_LABELS,
  COACHING_TYPE_LABELS,
} from '@/lib/attestation/types';
import { RevenueContextCard } from '@/components/attestation/stepper/context/RevenueContextCard';
import { CompContextCard } from '@/components/attestation/stepper/context/CompContextCard';
import type { SignalRecord } from '@/lib/database/signal-outcomes';

// ---------------------------------------------------------------------------
// Types
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

interface OwnershipScores {
  narrative_depth: number;
  ownership: number;
  variance_awareness: number;
  signal_density: number;
  command_tone: number;
  energy_alignment: number;
  overall_command_score: number;
  rationale?: string;
  avoidance_flag?: boolean;
  blame_shift_flag?: boolean;
  corrective_action_flag?: boolean;
  variance_reference_flag?: boolean;
}

interface Props {
  attestation: NightlyAttestation;
  compResolutions: CompResolution[];
  incidents: NightlyIncident[];
  coachingActions: CoachingAction[];
  venueName: string;
  date: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (amendmentReason?: string) => Promise<any>;
  // Context data (numbers the manager was responding to)
  reportSummary: ReportSummary | null;
  factsSummary: FactsSummary | null;
  compExceptions: CompExceptionsData | null;
  compReview: CompReviewData | null;
  compsByReason?: Array<{ reason: string; qty: number; amount: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;

function QABlock({ question, answer }: { question: string; answer?: string | null }) {
  if (!answer || answer.trim().length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{question}</div>
      <div className="text-sm leading-relaxed">{answer}</div>
    </div>
  );
}

function TagBadges({ tags, labelMap }: { tags?: string[] | null; labelMap: Record<string, string> }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="default" className="text-[11px]">
          {labelMap[tag] ?? tag}
        </Badge>
      ))}
    </div>
  );
}

function NothingToReport() {
  return (
    <div className="text-xs text-muted-foreground italic">
      Nothing to report
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  color = 'text-brass',
}: {
  icon: React.ElementType;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <h3 className="text-sm font-semibold uppercase tracking-wider">{label}</h3>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

const SIGNAL_TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  action_commitment: { label: 'Action Commitments', icon: Target },
  employee_mention: { label: 'Employee Mentions', icon: User },
  menu_item: { label: 'Menu Items', icon: UtensilsCrossed },
  guest_insight: { label: 'Guest Insights', icon: Lightbulb },
  operational_issue: { label: 'Operational Issues', icon: Wrench },
  staffing_signal: { label: 'Staffing Signals', icon: CalendarClock },
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-sage/20 text-sage border-sage/30',
  negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  neutral: 'bg-muted text-muted-foreground',
  actionable: 'bg-brass/20 text-brass border-brass/30',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttestationReport({
  attestation,
  compResolutions,
  incidents,
  coachingActions,
  venueName,
  date,
  submitting,
  error,
  onSubmit,
  reportSummary,
  factsSummary,
  compExceptions,
  compReview,
  compsByReason = [],
}: Props) {
  // Fetch signals on mount
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);

  useEffect(() => {
    if (!attestation?.id) return;
    let cancelled = false;
    setSignalsLoading(true);
    fetch(`/api/attestation/signals?attestation_id=${attestation.id}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { signals: [] }))
      .then((data) => {
        if (!cancelled) setSignals(data.signals ?? []);
      })
      .catch(() => {
        if (!cancelled) setSignals([]);
      })
      .finally(() => {
        if (!cancelled) setSignalsLoading(false);
      });
    return () => { cancelled = true; };
  }, [attestation?.id]);

  // Amendment state
  const [showAmend, setShowAmend] = useState(false);
  const [amendReason, setAmendReason] = useState('');

  const handleAmend = async () => {
    if (!amendReason.trim()) return;
    await onSubmit(amendReason.trim());
    setShowAmend(false);
    setAmendReason('');
  };

  const ownership = (attestation as any).ownership_scores as OwnershipScores | null | undefined;

  // Group signals by type
  const signalsByType = signals.reduce<Record<string, SignalRecord[]>>((acc, s) => {
    (acc[s.signal_type] ??= []).push(s);
    return acc;
  }, {});

  // Check acknowledged states
  const revenueHasContent = REVENUE_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  );
  const compHasContent = COMP_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  );
  const fohHasContent = FOH_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  );
  const bohHasContent = BOH_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  );
  const coachingHasContent = COACHING_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  );
  const guestHasContent = GUEST_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* ── Header ── */}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Nightly Attestation Report</h2>
            <div className="text-sm text-muted-foreground">
              {venueName} —{' '}
              {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={attestation.status === 'amended' ? 'outline' : 'default'} className="text-xs">
                {attestation.status === 'amended' ? 'Amended' : 'Submitted'}
              </Badge>
              {attestation.submitted_at && (
                <span className="text-xs text-muted-foreground">
                  {new Date(attestation.submitted_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* ── Revenue ── */}
          <section className="space-y-3">
            <SectionHeader icon={DollarSign} label="Revenue" />
            {reportSummary && (
              <RevenueContextCard
                netSales={reportSummary.net_sales}
                totalCovers={reportSummary.total_covers}
                totalComps={reportSummary.total_comps}
                forecast={factsSummary?.forecast}
                variance={factsSummary?.variance}
                foodSales={factsSummary?.food_sales}
                beverageSales={factsSummary?.beverage_sales}
                beveragePct={factsSummary?.beverage_pct}
              />
            )}
            {revenueHasContent ? (
              <div className="space-y-3">
                {REVENUE_PROMPT_KEYS.map((key) => (
                  <QABlock
                    key={key}
                    question={GUIDED_PROMPTS[key]}
                    answer={attestation[key] as string}
                  />
                ))}
              </div>
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.revenue_tags} labelMap={REVENUE_TAG_LABELS} />
          </section>

          <div className="border-t border-border" />

          {/* ── Comps ── */}
          <section className="space-y-3">
            <SectionHeader icon={ShieldAlert} label="Comps" />
            <CompContextCard
              totalComps={reportSummary?.total_comps ?? 0}
              netSales={reportSummary?.net_sales ?? 0}
              exceptionSummary={compExceptions?.summary ?? null}
              reviewSummary={compReview?.summary ?? null}
              compsByReason={compsByReason}
            />
            {compHasContent ? (
              <div className="space-y-3">
                {COMP_PROMPT_KEYS.map((key) => (
                  <QABlock
                    key={key}
                    question={COMP_PROMPT_QUESTIONS[key]}
                    answer={attestation[key] as string}
                  />
                ))}
              </div>
            ) : attestation.comp_acknowledged ? (
              <NothingToReport />
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.comp_tags} labelMap={COMP_TAG_LABELS} />

            {/* Comp Resolutions */}
            {compResolutions.length > 0 && (
              <div className="space-y-2 mt-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Comp Resolutions ({compResolutions.length})
                </div>
                <div className="space-y-2">
                  {compResolutions.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-md border border-border/50 p-3 text-sm space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="default" className="text-[11px]">
                          {COMP_RESOLUTION_LABELS[r.resolution_code] ?? r.resolution_code}
                        </Badge>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {r.comp_amount != null && (
                            <span className="font-medium">{fmt(r.comp_amount)} comp</span>
                          )}
                          {r.check_amount != null && (
                            <span>on {fmt(r.check_amount)} check</span>
                          )}
                        </div>
                      </div>
                      {r.employee_name && (
                        <div className="text-xs text-muted-foreground">
                          Server: {r.employee_name}
                        </div>
                      )}
                      {r.resolution_notes && (
                        <div className="text-sm">{r.resolution_notes}</div>
                      )}
                      {r.requires_follow_up && (
                        <Badge variant="outline" className="text-[10px] text-brass border-brass/40">
                          Follow-up required
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="border-t border-border" />

          {/* ── FOH ── */}
          <section className="space-y-3">
            <SectionHeader icon={UserCheck} label="Front of House" />
            {factsSummary?.labor && (
              <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/30 border border-brass/20 p-3">
                <div>
                  <div className="text-lg font-bold tabular-nums">{factsSummary.labor.labor_pct.toFixed(1)}%</div>
                  <div className="text-[11px] text-muted-foreground">Labor %</div>
                </div>
                <div>
                  <div className="text-lg font-bold tabular-nums">{fmt(factsSummary.labor.splh)}</div>
                  <div className="text-[11px] text-muted-foreground">SPLH</div>
                </div>
                <div>
                  <div className="text-lg font-bold tabular-nums">{factsSummary.labor.employee_count}</div>
                  <div className="text-[11px] text-muted-foreground">Employees</div>
                </div>
                {factsSummary.labor.foh && (
                  <div className="col-span-3 text-xs text-muted-foreground">
                    FOH: {factsSummary.labor.foh.employee_count} staff, {factsSummary.labor.foh.hours.toFixed(0)}h, {fmt(factsSummary.labor.foh.cost)}
                    {factsSummary.labor.boh && (
                      <span className="ml-3">BOH: {factsSummary.labor.boh.employee_count} staff, {factsSummary.labor.boh.hours.toFixed(0)}h, {fmt(factsSummary.labor.boh.cost)}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {fohHasContent ? (
              <div className="space-y-3">
                {FOH_PROMPT_KEYS.map((key) => (
                  <QABlock
                    key={key}
                    question={FOH_PROMPT_QUESTIONS[key]}
                    answer={attestation[key] as string}
                  />
                ))}
              </div>
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.labor_tags} labelMap={LABOR_TAG_LABELS} />
          </section>

          <div className="border-t border-border" />

          {/* ── BOH ── */}
          <section className="space-y-3">
            <SectionHeader icon={ChefHat} label="Back of House" />
            {bohHasContent ? (
              <div className="space-y-3">
                {BOH_PROMPT_KEYS.map((key) => (
                  <QABlock
                    key={key}
                    question={BOH_PROMPT_QUESTIONS[key]}
                    answer={attestation[key] as string}
                  />
                ))}
              </div>
            ) : (
              <NothingToReport />
            )}
          </section>

          <div className="border-t border-border" />

          {/* ── Incidents ── */}
          <section className="space-y-3">
            <SectionHeader icon={AlertOctagon} label="Incidents" />
            {attestation.incident_notes ? (
              <div className="text-sm leading-relaxed">{attestation.incident_notes}</div>
            ) : attestation.incidents_acknowledged ? (
              <NothingToReport />
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.incident_tags} labelMap={INCIDENT_TAG_LABELS} />

            {/* Incident log entries */}
            {incidents.length > 0 && (
              <div className="space-y-2 mt-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Incident Log ({incidents.length})
                </div>
                <div className="space-y-2">
                  {incidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="rounded-md border border-border/50 p-3 text-sm space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-[11px]">
                          {INCIDENT_TYPE_LABELS[inc.incident_type] ?? inc.incident_type}
                        </Badge>
                        <Badge className={`text-[11px] ${SEVERITY_COLORS[inc.severity] ?? ''}`}>
                          {inc.severity}
                        </Badge>
                      </div>
                      <div className="text-sm">{inc.description}</div>
                      {inc.resolution && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Resolution:</span> {inc.resolution}
                        </div>
                      )}
                      {inc.staff_involved.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Staff: {inc.staff_involved.join(', ')}
                        </div>
                      )}
                      {inc.follow_up_required && (
                        <Badge variant="outline" className="text-[10px] text-brass border-brass/40">
                          Follow-up required
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="border-t border-border" />

          {/* ── Coaching ── */}
          <section className="space-y-3">
            <SectionHeader icon={Users} label="Coaching" />
            {coachingHasContent ? (
              <div className="space-y-3">
                {COACHING_PROMPT_KEYS.map((key) => (
                  <QABlock
                    key={key}
                    question={COACHING_PROMPT_QUESTIONS[key]}
                    answer={attestation[key] as string}
                  />
                ))}
              </div>
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.coaching_tags} labelMap={COACHING_TAG_LABELS} />

            {/* Coaching action entries */}
            {coachingActions.length > 0 && (
              <div className="space-y-2 mt-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Coaching Actions ({coachingActions.length})
                </div>
                <div className="space-y-2">
                  {coachingActions.map((ca) => (
                    <div
                      key={ca.id}
                      className="rounded-md border border-border/50 p-3 text-sm space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{ca.employee_name}</span>
                          <Badge variant="default" className="text-[11px]">
                            {COACHING_TYPE_LABELS[ca.coaching_type] ?? ca.coaching_type}
                          </Badge>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            ca.status === 'completed'
                              ? 'text-sage border-sage/40'
                              : ca.status === 'escalated'
                                ? 'text-red-600 border-red-400'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {ca.status}
                        </Badge>
                      </div>
                      <div className="text-sm">{ca.reason}</div>
                      {ca.action_taken && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Action:</span> {ca.action_taken}
                        </div>
                      )}
                      {ca.follow_up_date && (
                        <div className="text-xs text-muted-foreground">
                          Follow-up:{' '}
                          {new Date(ca.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="border-t border-border" />

          {/* ── Guest ── */}
          <section className="space-y-3">
            <SectionHeader icon={Crown} label="Guest" />
            {guestHasContent ? (
              <div className="space-y-3">
                {GUEST_PROMPT_KEYS.map((key) => (
                  <QABlock
                    key={key}
                    question={GUEST_PROMPT_QUESTIONS[key]}
                    answer={attestation[key] as string}
                  />
                ))}
              </div>
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.guest_tags} labelMap={GUEST_TAG_LABELS} />
          </section>

          <div className="border-t border-border" />

          {/* ── AI Closing Narrative ── */}
          {attestation.closing_narrative && (
            <>
              <section className="space-y-3">
                <SectionHeader icon={Sparkles} label="Closing Summary" />
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {attestation.closing_narrative}
                </p>
              </section>
              <div className="border-t border-border" />
            </>
          )}

          {/* ── AI Signals ── */}
          {signals.length > 0 && (
            <section className="space-y-3">
              <SectionHeader icon={Brain} label="Extracted Signals" color="text-purple-500" />
              <div className="text-xs text-muted-foreground">
                AI-extracted insights from manager narratives
              </div>
              <div className="space-y-4">
                {Object.entries(SIGNAL_TYPE_META).map(([type, meta]) => {
                  const typeSignals = signalsByType[type];
                  if (!typeSignals || typeSignals.length === 0) return null;
                  const Icon = meta.icon;
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">
                          {meta.label} ({typeSignals.length})
                        </span>
                      </div>
                      <div className="space-y-1.5 pl-5">
                        {typeSignals.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <div className="flex-1 min-w-0">
                              {s.entity_name && (
                                <span className="font-medium mr-1">{s.entity_name}</span>
                              )}
                              <span className="text-muted-foreground">
                                {s.extracted_text}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {s.mention_sentiment && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${SENTIMENT_COLORS[s.mention_sentiment] ?? ''}`}
                                >
                                  {s.mention_sentiment}
                                </Badge>
                              )}
                              {s.commitment_status && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    s.commitment_status === 'fulfilled'
                                      ? 'text-sage border-sage/40'
                                      : s.commitment_status === 'unfulfilled'
                                        ? 'text-red-600 border-red-400'
                                        : 'text-muted-foreground'
                                  }`}
                                >
                                  {s.commitment_status}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {signalsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading signals...
            </div>
          )}

          {/* ── Ownership Scores ── */}
          {ownership && (
            <>
              <div className="border-t border-border" />
              <section className="space-y-3">
                <SectionHeader icon={Brain} label="Command Score" color="text-purple-500" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    ['Narrative Depth', ownership.narrative_depth],
                    ['Ownership', ownership.ownership],
                    ['Variance Awareness', ownership.variance_awareness],
                    ['Signal Density', ownership.signal_density],
                    ['Command Tone', ownership.command_tone],
                    ['Energy Alignment', ownership.energy_alignment],
                  ] as const).map(([label, score]) => (
                    <div key={label} className="space-y-1">
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brass transition-all"
                            style={{ width: `${(score / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-6 text-right">{score}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <div className="text-sm font-semibold">
                    Overall: {ownership.overall_command_score}/10
                  </div>
                  {ownership.avoidance_flag && (
                    <Badge variant="outline" className="text-[10px] text-red-600 border-red-400">
                      Avoidance detected
                    </Badge>
                  )}
                  {ownership.blame_shift_flag && (
                    <Badge variant="outline" className="text-[10px] text-red-600 border-red-400">
                      Blame shift
                    </Badge>
                  )}
                  {ownership.corrective_action_flag && (
                    <Badge variant="outline" className="text-[10px] text-sage border-sage/40">
                      Corrective action
                    </Badge>
                  )}
                </div>
                {ownership.rationale && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ownership.rationale}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* ── Footer: Locked / Amend ── */}
      <div className="shrink-0 p-4 border-t border-border">
        {error && (
          <div className="bg-error/5 border border-error/30 rounded-md p-3 text-sm text-error mb-3">
            {error}
          </div>
        )}

        {!showAmend ? (
          <div className="border border-sage/40 rounded-md p-3 bg-sage/5">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-sage" />
              <div className="flex-1">
                <div className="text-sm font-medium text-sage">
                  Attestation {attestation.status === 'amended' ? 'Amended' : 'Submitted'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {attestation.submitted_at &&
                    new Date(attestation.submitted_at).toLocaleString()}
                  {attestation.amendment_reason && (
                    <span className="ml-2">— Amendment: {attestation.amendment_reason}</span>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowAmend(true)}>
                Amend
              </Button>
            </div>
          </div>
        ) : (
          <div className="border border-brass/40 rounded-md p-3 bg-brass/5 space-y-3">
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
        )}
      </div>
    </div>
  );
}
