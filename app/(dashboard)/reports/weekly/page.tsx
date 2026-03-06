/**
 * Weekly Agenda Page
 *
 * 7-day executive view: revenue, labor, enforcement, AI narrative.
 * Reusable for any venue / any week.
 */

'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useVenue } from '@/components/providers/VenueProvider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  DollarSign,
  Users,
  Percent,
  AlertTriangle,
  ShieldCheck,
  Briefcase,
  Sparkles,
  MessageSquarePlus,
  Save,
  Check,
  Share2,
  Copy,
  ExternalLink,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════
// TYPES (mirrors lib/database/weekly-agenda.ts)
// ══════════════════════════════════════════════════════════════════════════

interface WeeklyAgendaDayRow {
  business_date: string;
  day_of_week: string;
  net_sales: number;
  gross_sales: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  covers_count: number;
  checks_count: number;
  avg_check: number;
  comps_total: number;
  voids_total: number;
  forecast_revenue: number | null;
  vs_forecast_pct: number | null;
  forecast_covers: number | null;
  vs_forecast_covers_pct: number | null;
  sdlw_net_sales: number | null;
  vs_sdlw_pct: number | null;
  sdlw_covers: number | null;
  vs_sdlw_covers_pct: number | null;
  labor_cost: number;
  labor_pct: number;
  labor_hours: number;
  ot_hours: number;
  employee_count: number;
  foh_cost: number;
  boh_cost: number;
  splh: number;
  cplh: number;
  comp_exception_count: number;
  labor_exception_count: number;
  carry_forward_count: number;
  critical_open_count: number;
}

interface WeeklyAgendaTotals {
  net_sales: number;
  gross_sales: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  covers_count: number;
  checks_count: number;
  avg_check: number;
  comps_total: number;
  comp_pct: number;
  voids_total: number;
  total_forecast_revenue: number | null;
  vs_forecast_pct: number | null;
  total_forecast_covers: number | null;
  vs_forecast_covers_pct: number | null;
  total_sdlw_net_sales: number | null;
  vs_sdlw_pct: number | null;
  total_sdlw_covers: number | null;
  vs_sdlw_covers_pct: number | null;
  total_labor_cost: number;
  labor_pct: number;
  total_labor_hours: number;
  total_ot_hours: number;
  avg_splh: number;
  avg_cplh: number;
}

interface CompResolutionBreakdown {
  resolution_code: string;
  count: number;
  total_amount: number;
  policy_violation_count: number;
  follow_up_required_count: number;
}

interface EnforcementSummary {
  total_comp_exceptions: number;
  total_labor_exceptions: number;
  total_procurement_exceptions: number;
  total_revenue_variances: number;
  carry_forward_count: number;
  critical_open_count: number;
  escalated_count: number;
  attestation_submitted: number;
  attestation_expected: number;
  attestation_compliance_pct: number;
  comp_resolutions: CompResolutionBreakdown[];
}

interface LaborInsight {
  revenue_variance_reasons: Array<{ reason: string; count: number }>;
  labor_variance_reasons: Array<{ reason: string; count: number }>;
  labor_tags: Array<{ tag: string; count: number }>;
}

interface GmNotes {
  id?: string;
  headline: string | null;
  revenue_context: string | null;
  opentable_rating: number | null;
  google_rating: number | null;
  guest_compliments: string | null;
  guest_complaints: string | null;
  guest_action_items: string | null;
  staffing_notes: string | null;
  team_shoutout: string | null;
  comp_context: string | null;
  operations_notes: string | null;
  next_week_outlook: string | null;
  upcoming_events: string | null;
}

interface ReviewSummary {
  total_reviews: number;
  negative_reviews: number;
  avg_rating: number | null;
  source_breakdown: Record<string, number>;
  top_tags: Array<{ tag: string; count: number }>;
  unresponded_count: number;
  negative_review_texts: Array<{
    source: string;
    rating: number;
    content: string;
    reviewed_at: string;
    thirdparty_url: string | null;
  }>;
}

interface WeeklyAgendaPayload {
  venue_id: string;
  venue_name: string;
  week_start: string;
  week_end: string;
  days: WeeklyAgendaDayRow[];
  totals: WeeklyAgendaTotals;
  enforcement: EnforcementSummary;
  labor_insights: LaborInsight;
  reviews: ReviewSummary;
  gm_notes: GmNotes | null;
  generated_at: string;
}

interface WeeklyNarrativeOutput {
  executive_summary: string;
  revenue_analysis: string;
  guest_experience: string;
  labor_analysis: string;
  enforcement_analysis: string;
  key_risks: string[];
  recommendations: string[];
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

const fmtC = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtPct = (v: number | null) =>
  v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';
const varianceColor = (v: number | null) =>
  v == null ? 'text-muted-foreground' : v >= 0 ? 'text-green-600' : 'text-red-500';

/** Format a local Date as YYYY-MM-DD (avoids UTC shift from toISOString) */
function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Get the Monday of the week containing today */
function getCurrentMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return toLocalDateStr(d);
}

/** Get the Monday of last week */
function getLastMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
  d.setDate(diff);
  return toLocalDateStr(d);
}

function shiftWeek(monday: string, weeks: number): string {
  const d = new Date(monday + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

function formatWeekRange(monday: string): string {
  const start = new Date(monday + 'T12:00:00Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function WeeklyAgendaPage() {
  const { selectedVenue } = useVenue();
  const selectedVenueId = selectedVenue?.id ?? null;
  const [weekStart, setWeekStart] = useState(getLastMonday);
  const [payload, setPayload] = useState<WeeklyAgendaPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [narrative, setNarrative] = useState<WeeklyNarrativeOutput | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

  // GM Notes state
  const [gmNotes, setGmNotes] = useState<GmNotes>({
    headline: null,
    revenue_context: null,
    opentable_rating: null,
    google_rating: null,
    guest_compliments: null,
    guest_complaints: null,
    guest_action_items: null,
    staffing_notes: null,
    team_shoutout: null,
    comp_context: null,
    operations_notes: null,
    next_week_outlook: null,
    upcoming_events: null,
  });
  const [gmNotesSaving, setGmNotesSaving] = useState(false);
  const [gmNotesSaved, setGmNotesSaved] = useState(false);

  // Fetch data when venue or week changes
  const fetchData = useCallback(async () => {
    if (!selectedVenueId) return;
    setLoading(true);
    setError(null);
    setNarrative(null);
    setGmNotesSaved(false);
    setShareUrl(null);
    setShareCopied(false);
    try {
      const res = await fetch(`/api/reports/weekly?venue_id=${selectedVenueId}&week_start=${weekStart}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPayload(data.payload);
      // Populate GM notes from payload (or reset to empty)
      const gm = data.payload?.gm_notes;
      setGmNotes({
        id: gm?.id,
        headline: gm?.headline ?? null,
        revenue_context: gm?.revenue_context ?? null,
        opentable_rating: gm?.opentable_rating ?? null,
        google_rating: gm?.google_rating ?? null,
        guest_compliments: gm?.guest_compliments ?? null,
        guest_complaints: gm?.guest_complaints ?? null,
        guest_action_items: gm?.guest_action_items ?? null,
        staffing_notes: gm?.staffing_notes ?? null,
        team_shoutout: gm?.team_shoutout ?? null,
        comp_context: gm?.comp_context ?? null,
        operations_notes: gm?.operations_notes ?? null,
        next_week_outlook: gm?.next_week_outlook ?? null,
        upcoming_events: gm?.upcoming_events ?? null,
      });
    } catch (err: any) {
      setError(err.message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId, weekStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate AI narrative
  const generateNarrative = async () => {
    if (!selectedVenueId) return;
    setNarrativeLoading(true);
    setNarrativeError(null);
    try {
      const res = await fetch('/api/ai/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: selectedVenueId, week_start: weekStart }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setNarrative(data.narrative);
    } catch (err: any) {
      setNarrativeError(err.message);
    } finally {
      setNarrativeLoading(false);
    }
  };

  // Save GM notes
  const saveGmNotes = async () => {
    if (!selectedVenueId) return;
    setGmNotesSaving(true);
    try {
      const res = await fetch('/api/reports/weekly/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: selectedVenueId,
          week_start: weekStart,
          notes: {
            headline: gmNotes.headline || null,
            revenue_context: gmNotes.revenue_context || null,
            opentable_rating: gmNotes.opentable_rating || null,
            google_rating: gmNotes.google_rating || null,
            guest_compliments: gmNotes.guest_compliments || null,
            guest_complaints: gmNotes.guest_complaints || null,
            guest_action_items: gmNotes.guest_action_items || null,
            staffing_notes: gmNotes.staffing_notes || null,
            team_shoutout: gmNotes.team_shoutout || null,
            comp_context: gmNotes.comp_context || null,
            operations_notes: gmNotes.operations_notes || null,
            next_week_outlook: gmNotes.next_week_outlook || null,
            upcoming_events: gmNotes.upcoming_events || null,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setGmNotesSaved(true);
      setTimeout(() => setGmNotesSaved(false), 2000);
    } catch (err: any) {
      console.error('Failed to save GM notes:', err);
    } finally {
      setGmNotesSaving(false);
    }
  };

  const hasAnyNotes = !!(gmNotes.headline || gmNotes.revenue_context || gmNotes.guest_compliments || gmNotes.guest_complaints || gmNotes.staffing_notes || gmNotes.comp_context || gmNotes.operations_notes || gmNotes.next_week_outlook || gmNotes.upcoming_events || gmNotes.opentable_rating || gmNotes.google_rating);

  // Share link state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const createShareLink = async () => {
    if (!selectedVenueId) return;
    setShareLoading(true);
    try {
      const res = await fetch('/api/reports/weekly/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: selectedVenueId, week_start: weekStart }),
      });
      if (!res.ok) throw new Error('Failed to create share link');
      const data = await res.json();
      setShareUrl(data.share_url);
    } catch (err: any) {
      console.error('Share failed:', err);
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="page-header">Weekly Agenda</h1>
          <p className="text-muted-foreground text-sm">
            7-day executive overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          {payload && (
            <>
              {!shareUrl ? (
                <Button onClick={createShareLink} disabled={shareLoading} variant="outline" size="sm">
                  {shareLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Share2 className="h-4 w-4 mr-1" />}
                  Share
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button onClick={copyShareUrl} variant="outline" size="sm">
                    {shareCopied ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                    {shareCopied ? 'Copied!' : 'Copy Link'}
                  </Button>
                  <Button onClick={() => window.open(shareUrl, '_blank')} variant="ghost" size="icon" className="h-8 w-8">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Week Navigator */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setWeekStart(prev => shiftWeek(prev, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[200px] text-center">
          {formatWeekRange(weekStart)}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setWeekStart(prev => shiftWeek(prev, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading / Error States */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="p-6">
          <p className="text-red-500 text-sm">{error}</p>
        </Card>
      )}

      {!loading && !error && payload && (
        <div className="space-y-6">
          {/* Section 1: Revenue Summary */}
          <RevenueSection days={payload.days} totals={payload.totals} />

          {/* Section 2: Guest Experience (auto from reviews) */}
          <GuestExperienceSection reviews={payload.reviews} />

          {/* Section 3: Comp & Enforcement */}
          <EnforcementSection days={payload.days} enforcement={payload.enforcement} />

          {/* Section 3: Labor Summary */}
          <LaborSection days={payload.days} totals={payload.totals} insights={payload.labor_insights} />

          {/* Section 4: GM Context */}
          <GmNotesSection
            notes={gmNotes}
            onChange={setGmNotes}
            onSave={saveGmNotes}
            saving={gmNotesSaving}
            saved={gmNotesSaved}
          />

          {/* Section 5: AI Executive Narrative */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-brass" />
                  Executive Summary
                </CardTitle>
                {!narrative && (
                  <Button
                    onClick={generateNarrative}
                    disabled={narrativeLoading}
                    size="sm"
                  >
                    {narrativeLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Generating...
                      </>
                    ) : (
                      'Generate Summary'
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {narrativeError && (
                <p className="text-red-500 text-sm mb-4">{narrativeError}</p>
              )}
              {!narrative && !narrativeLoading && !narrativeError && (
                <p className="text-muted-foreground text-sm">
                  Click "Generate Summary" to create an AI-powered executive briefing for this week.
                </p>
              )}
              {narrative && <NarrativeDisplay narrative={narrative} />}
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && !error && !payload && !selectedVenueId && (
        <Card className="p-6">
          <p className="text-muted-foreground text-sm">Select a venue to view the weekly agenda.</p>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function RevenueSection({ days, totals }: { days: WeeklyAgendaDayRow[]; totals: WeeklyAgendaTotals }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-brass" />
          Revenue Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium text-muted-foreground"></th>
                {days.map(d => (
                  <th key={d.business_date} className="py-2 px-2 font-medium text-center min-w-[80px]">
                    <div>{d.day_of_week.slice(0, 3)}</div>
                    <div className="text-xs text-muted-foreground">{d.business_date.slice(5)}</div>
                  </th>
                ))}
                <th className="py-2 px-2 font-semibold text-center min-w-[90px] bg-muted/50">Total</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Net Sales" values={days.map(d => fmtC(d.net_sales))} total={fmtC(totals.net_sales)} />
              <MetricRow label="Covers" values={days.map(d => String(d.covers_count))} total={String(totals.covers_count)} />
              <MetricRow label="Avg Check" values={days.map(d => fmtC(d.avg_check))} total={fmtC(totals.avg_check)} />
              <MetricRow
                label="F / B Mix"
                values={days.map(d => {
                  const foodPct = d.net_sales > 0 ? (100 - d.beverage_pct).toFixed(0) : '0';
                  const bevPct = d.beverage_pct.toFixed(0);
                  return `${foodPct} / ${bevPct}`;
                })}
                total={`${(100 - totals.beverage_pct).toFixed(0)} / ${totals.beverage_pct.toFixed(0)}`}
              />
              <DualVarianceRow
                label="vs Forecast"
                revValues={days.map(d => d.vs_forecast_pct)}
                coversValues={days.map(d => d.vs_forecast_covers_pct)}
                revTotal={totals.vs_forecast_pct}
                coversTotal={totals.vs_forecast_covers_pct}
              />
              <DualVarianceRow
                label="vs SDLW"
                revValues={days.map(d => d.vs_sdlw_pct)}
                coversValues={days.map(d => d.vs_sdlw_covers_pct)}
                revTotal={totals.vs_sdlw_pct}
                coversTotal={totals.vs_sdlw_covers_pct}
              />
              <MetricRow label="Comps" values={days.map(d => fmtC(d.comps_total))} total={fmtC(totals.comps_total)} />
              <MetricRow label="Comp %" values={days.map(d => d.net_sales > 0 ? ((d.comps_total / d.net_sales) * 100).toFixed(1) + '%' : '—')} total={totals.comp_pct.toFixed(1) + '%'} />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EnforcementSection({ days, enforcement }: { days: WeeklyAgendaDayRow[]; enforcement: EnforcementSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brass" />
          Comp & Enforcement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily comp exceptions */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium text-muted-foreground"></th>
                {days.map(d => (
                  <th key={d.business_date} className="py-2 px-2 font-medium text-center min-w-[80px]">
                    {d.day_of_week.slice(0, 3)}
                  </th>
                ))}
                <th className="py-2 px-2 font-semibold text-center min-w-[90px] bg-muted/50">Total</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow
                label="Comp Exceptions"
                values={days.map(d => String(d.comp_exception_count))}
                total={String(enforcement.total_comp_exceptions)}
              />
              <MetricRow
                label="Labor Exceptions"
                values={days.map(d => String(d.labor_exception_count))}
                total={String(enforcement.total_labor_exceptions)}
              />
            </tbody>
          </table>
        </div>

        {/* Enforcement badges */}
        <div className="flex flex-wrap gap-3">
          <Badge label="Attestation Compliance" value={`${enforcement.attestation_compliance_pct.toFixed(0)}%`}
            color={enforcement.attestation_compliance_pct >= 100 ? 'green' : enforcement.attestation_compliance_pct >= 80 ? 'yellow' : 'red'} />
          <Badge label="Carry-Forward" value={String(enforcement.carry_forward_count)}
            color={enforcement.carry_forward_count === 0 ? 'green' : 'yellow'} />
          <Badge label="Critical Open" value={String(enforcement.critical_open_count)}
            color={enforcement.critical_open_count === 0 ? 'green' : 'red'} />
          <Badge label="Escalated" value={String(enforcement.escalated_count)}
            color={enforcement.escalated_count === 0 ? 'green' : 'red'} />
        </div>

        {/* Resolution code breakdown */}
        {enforcement.comp_resolutions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Comp Resolution Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Resolution Code</th>
                    <th className="py-2 px-2 text-center font-medium text-muted-foreground">Count</th>
                    <th className="py-2 px-2 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="py-2 px-2 text-center font-medium text-muted-foreground">Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {enforcement.comp_resolutions.map(cr => (
                    <tr key={cr.resolution_code} className="border-b border-muted/50">
                      <td className="py-2 pr-4">{humanizeCode(cr.resolution_code)}</td>
                      <td className="py-2 px-2 text-center">{cr.count}</td>
                      <td className="py-2 px-2 text-right">{fmtC(cr.total_amount)}</td>
                      <td className="py-2 px-2 text-center">
                        {cr.policy_violation_count > 0 ? (
                          <span className="text-red-500 font-medium">{cr.policy_violation_count}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LaborSection({ days, totals, insights }: { days: WeeklyAgendaDayRow[]; totals: WeeklyAgendaTotals; insights: LaborInsight }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-brass" />
          Labor Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium text-muted-foreground"></th>
                {days.map(d => (
                  <th key={d.business_date} className="py-2 px-2 font-medium text-center min-w-[80px]">
                    <div>{d.day_of_week.slice(0, 3)}</div>
                    <div className="text-xs text-muted-foreground">{d.business_date.slice(5)}</div>
                  </th>
                ))}
                <th className="py-2 px-2 font-semibold text-center min-w-[90px] bg-muted/50">Total</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Labor Cost" values={days.map(d => fmtC(d.labor_cost))} total={fmtC(totals.total_labor_cost)} />
              <MetricRow label="Labor %" values={days.map(d => d.labor_pct.toFixed(1) + '%')} total={totals.labor_pct.toFixed(1) + '%'} />
              <MetricRow label="Hours" values={days.map(d => d.labor_hours.toFixed(0))} total={totals.total_labor_hours.toFixed(0)} />
              <MetricRow label="OT Hours" values={days.map(d => d.ot_hours.toFixed(1))} total={totals.total_ot_hours.toFixed(1)} />
              <MetricRow label="SPLH" values={days.map(d => fmtC(d.splh))} total={fmtC(totals.avg_splh)} />
              <MetricRow label="CPLH" values={days.map(d => d.cplh.toFixed(1))} total={totals.avg_cplh.toFixed(1)} />
            </tbody>
          </table>
        </div>

        {/* Attestation-reported insights */}
        {(insights.labor_variance_reasons.length > 0 || insights.revenue_variance_reasons.length > 0 || insights.labor_tags.length > 0) && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Manager-Reported Insights</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.revenue_variance_reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Revenue Variance Reasons</p>
                  {insights.revenue_variance_reasons.map(r => (
                    <div key={r.reason} className="flex justify-between text-sm">
                      <span>{humanizeCode(r.reason)}</span>
                      <span className="text-muted-foreground">{r.count}x</span>
                    </div>
                  ))}
                </div>
              )}
              {insights.labor_variance_reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Labor Variance Reasons</p>
                  {insights.labor_variance_reasons.map(r => (
                    <div key={r.reason} className="flex justify-between text-sm">
                      <span>{humanizeCode(r.reason)}</span>
                      <span className="text-muted-foreground">{r.count}x</span>
                    </div>
                  ))}
                </div>
              )}
              {insights.labor_tags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Labor Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {insights.labor_tags.map(t => (
                      <span key={t.tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted">
                        {humanizeCode(t.tag)} ({t.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GuestExperienceSection({ reviews }: { reviews: ReviewSummary }) {
  const sourceNames: Record<string, string> = { GOOGLE: 'Google', OPEN_TABLE: 'OpenTable', YELP: 'Yelp' };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-brass" />
          Guest Experience
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviews.total_reviews === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews recorded for this week.</p>
        ) : (
          <>
            {/* Stats row */}
            <div className="flex flex-wrap gap-3">
              <Badge
                label="Avg Rating"
                value={reviews.avg_rating?.toFixed(1) ?? '—'}
                color={reviews.avg_rating && reviews.avg_rating >= 4.0 ? 'green' : reviews.avg_rating && reviews.avg_rating >= 3.0 ? 'yellow' : 'red'}
              />
              <Badge label="Total Reviews" value={String(reviews.total_reviews)} color="green" />
              <Badge
                label="Negative"
                value={String(reviews.negative_reviews)}
                color={reviews.negative_reviews === 0 ? 'green' : reviews.negative_reviews <= 2 ? 'yellow' : 'red'}
              />
              <Badge
                label="Unresponded"
                value={String(reviews.unresponded_count)}
                color={reviews.unresponded_count === 0 ? 'green' : 'red'}
              />
            </div>

            {/* Source breakdown */}
            {Object.keys(reviews.source_breakdown).length > 0 && (
              <div className="flex gap-4 text-sm">
                {Object.entries(reviews.source_breakdown).map(([src, cnt]) => (
                  <span key={src} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{cnt}</span> {sourceNames[src] || src}
                  </span>
                ))}
              </div>
            )}

            {/* Top tags */}
            {reviews.top_tags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Mentioned Topics</p>
                <div className="flex flex-wrap gap-1">
                  {reviews.top_tags.map(t => (
                    <span key={t.tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted">
                      {t.tag} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Negative review content */}
            {reviews.negative_review_texts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Negative Reviews</p>
                <div className="space-y-2">
                  {reviews.negative_review_texts.map((r, i) => (
                    <div key={i} className="border-l-2 border-red-300 pl-3 py-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
                        <span className="font-medium">{sourceNames[r.source] || r.source}</span>
                        <span className="text-red-500">{'★'.repeat(Math.round(r.rating))}</span>
                        <span>{new Date(r.reviewed_at).toLocaleDateString()}</span>
                        {r.thirdparty_url && (
                          <a href={r.thirdparty_url} target="_blank" rel="noopener noreferrer" className="text-brass hover:underline">
                            View →
                          </a>
                        )}
                      </div>
                      <p className="text-sm">{r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GmNotesSection({
  notes,
  onChange,
  onSave,
  saving,
  saved,
}: {
  notes: GmNotes;
  onChange: (notes: GmNotes) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = !!(notes.headline || notes.revenue_context || notes.guest_compliments || notes.guest_complaints || notes.staffing_notes || notes.comp_context || notes.operations_notes || notes.next_week_outlook || notes.upcoming_events || notes.opentable_rating || notes.google_rating);

  // Auto-expand if there's existing content
  React.useEffect(() => {
    if (hasContent) setExpanded(true);
  }, [hasContent]);

  const updateField = (field: keyof GmNotes, value: string) => {
    onChange({ ...notes, [field]: value || null });
  };

  const updateRating = (field: 'opentable_rating' | 'google_rating', value: string) => {
    const num = parseFloat(value);
    onChange({ ...notes, [field]: isNaN(num) ? null : num });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-brass" />
            Weekly Venue Sync
          </CardTitle>
          <div className="flex items-center gap-2">
            {expanded && (
              <Button
                onClick={onSave}
                disabled={saving}
                size="sm"
                variant="outline"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : saved ? (
                  <Check className="h-4 w-4 mr-1 text-green-600" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                {saved ? 'Saved' : 'Save'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Collapse' : hasContent ? 'Edit' : 'Add Context'}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground">
            GM context for the weekly briefing. Notes are woven into the AI executive narrative.
          </p>

          {/* Summary */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Summary</h4>
            <div className="space-y-1">
              <Label htmlFor="gm-headline" className="text-xs font-medium">Headline</Label>
              <Input
                id="gm-headline"
                placeholder="One-liner: e.g. 'Closed Monday, strong weekend with private event Wed'"
                value={notes.headline ?? ''}
                onChange={(e) => updateField('headline', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gm-revenue" className="text-xs font-medium">Revenue Context</Label>
              <Textarea
                id="gm-revenue"
                placeholder="Key revenue drivers, days that over/under-performed, event impact..."
                value={notes.revenue_context ?? ''}
                onChange={(e) => updateField('revenue_context', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Guest Experience (ratings auto-pulled; GM adds qualitative context) */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Guest Experience</h4>
            <p className="text-xs text-muted-foreground">Review ratings and content are auto-pulled above. Add your qualitative context here.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="gm-compliments" className="text-xs font-medium">Top Compliments</Label>
                <Textarea
                  id="gm-compliments"
                  placeholder="Top 3 guest compliments this week..."
                  value={notes.guest_compliments ?? ''}
                  onChange={(e) => updateField('guest_compliments', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gm-complaints" className="text-xs font-medium">Top Complaints</Label>
                <Textarea
                  id="gm-complaints"
                  placeholder="Top 3 guest complaints this week..."
                  value={notes.guest_complaints ?? ''}
                  onChange={(e) => updateField('guest_complaints', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gm-action" className="text-xs font-medium">Action Plan</Label>
              <Textarea
                id="gm-action"
                placeholder="Action items from guest feedback, owner for each item..."
                value={notes.guest_action_items ?? ''}
                onChange={(e) => updateField('guest_action_items', e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Team & Staffing */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Team & Staffing</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="gm-staffing" className="text-xs font-medium">Staffing Notes</Label>
                <Textarea
                  id="gm-staffing"
                  placeholder="New hires, promotions, terminations, issues, areas of improvement..."
                  value={notes.staffing_notes ?? ''}
                  onChange={(e) => updateField('staffing_notes', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gm-shoutout" className="text-xs font-medium">Team Shoutout</Label>
                <Textarea
                  id="gm-shoutout"
                  placeholder="Who stood out this week and why..."
                  value={notes.team_shoutout ?? ''}
                  onChange={(e) => updateField('team_shoutout', e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Enforcement + Operations */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Operations</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="gm-comp" className="text-xs font-medium">Comp / Exception Context</Label>
                <Textarea
                  id="gm-comp"
                  placeholder="Context on flagged comps or exceptions..."
                  value={notes.comp_context ?? ''}
                  onChange={(e) => updateField('comp_context', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gm-ops" className="text-xs font-medium">Venue Needs & Maintenance</Label>
                <Textarea
                  id="gm-ops"
                  placeholder="Maintenance issues, venue needs, rez/cover flow notes, event setup..."
                  value={notes.operations_notes ?? ''}
                  onChange={(e) => updateField('operations_notes', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Forward-Looking */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Forward-Looking</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="gm-outlook" className="text-xs font-medium">Focus for Next Week</Label>
                <Textarea
                  id="gm-outlook"
                  placeholder="3 key items of focus for next week..."
                  value={notes.next_week_outlook ?? ''}
                  onChange={(e) => updateField('next_week_outlook', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gm-events" className="text-xs font-medium">Upcoming Events</Label>
                <Textarea
                  id="gm-events"
                  placeholder="Events for the month, updates..."
                  value={notes.upcoming_events ?? ''}
                  onChange={(e) => updateField('upcoming_events', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>
        </CardContent>
      )}
      {!expanded && hasContent && (
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            {notes.headline || 'Notes saved — click Edit to view'}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function NarrativeDisplay({ narrative }: { narrative: WeeklyNarrativeOutput }) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Executive Summary</h4>
        <p className="text-sm leading-relaxed">{narrative.executive_summary}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Revenue Analysis</h4>
        <p className="text-sm leading-relaxed">{narrative.revenue_analysis}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Guest Experience</h4>
        <p className="text-sm leading-relaxed">{narrative.guest_experience}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Labor Analysis</h4>
        <p className="text-sm leading-relaxed">{narrative.labor_analysis}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Enforcement Analysis</h4>
        <p className="text-sm leading-relaxed">{narrative.enforcement_analysis}</p>
      </div>
      {narrative.key_risks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Key Risks</h4>
          <ul className="space-y-1">
            {narrative.key_risks.map((risk, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}
      {narrative.recommendations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Recommendations</h4>
          <ul className="space-y-1">
            {narrative.recommendations.map((rec, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-brass font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TABLE HELPERS
// ══════════════════════════════════════════════════════════════════════════

function MetricRow({ label, values, total }: { label: string; values: string[]; total: string }) {
  return (
    <tr className="border-b border-muted/50">
      <td className="py-2 pr-4 text-muted-foreground font-medium whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-2 px-2 text-center tabular-nums">{v}</td>
      ))}
      <td className="py-2 px-2 text-center font-semibold tabular-nums bg-muted/50">{total}</td>
    </tr>
  );
}

function DualVarianceRow({ label, revValues, coversValues, revTotal, coversTotal }: {
  label: string;
  revValues: (number | null)[];
  coversValues: (number | null)[];
  revTotal: number | null;
  coversTotal: number | null;
}) {
  return (
    <tr className="border-b border-muted/50">
      <td className="py-2 pr-4 text-muted-foreground font-medium whitespace-nowrap">
        <div>{label}</div>
        <div className="text-[10px] text-muted-foreground/60 font-normal">rev / cvrs</div>
      </td>
      {revValues.map((rv, i) => {
        const cv = coversValues[i];
        return (
          <td key={i} className="py-1.5 px-2 text-center text-xs tabular-nums">
            <span className={varianceColor(rv)}>{fmtPct(rv)}</span>
            <span className="text-muted-foreground/40 mx-0.5">/</span>
            <span className={varianceColor(cv)}>{fmtPct(cv)}</span>
          </td>
        );
      })}
      <td className="py-1.5 px-2 text-center text-xs font-semibold tabular-nums bg-muted/50">
        <span className={varianceColor(revTotal)}>{fmtPct(revTotal)}</span>
        <span className="text-muted-foreground/40 mx-0.5">/</span>
        <span className={varianceColor(coversTotal)}>{fmtPct(coversTotal)}</span>
      </td>
    </tr>
  );
}

function VarianceRow({ label, values, total }: { label: string; values: (number | null)[]; total: number | null }) {
  return (
    <tr className="border-b border-muted/50">
      <td className="py-2 pr-4 text-muted-foreground font-medium whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`py-2 px-2 text-center tabular-nums ${varianceColor(v)}`}>
          {fmtPct(v)}
        </td>
      ))}
      <td className={`py-2 px-2 text-center font-semibold tabular-nums bg-muted/50 ${varianceColor(total)}`}>
        {fmtPct(total)}
      </td>
    </tr>
  );
}

function Badge({ label, value, color }: { label: string; value: string; color: 'green' | 'yellow' | 'red' }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors[color]}`}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
