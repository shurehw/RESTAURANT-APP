/**
 * Nightly Report Page
 * Shows end-of-day operational data from TipSee POS
 */

'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import {
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Percent,
  Gift,
  Star,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UtensilsCrossed,
  Clock,
  AlertTriangle,
  Target,
  ShieldAlert,
  XCircle,
  AlertOctagon,
  Sparkles,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface NightlyReportData {
  date: string;
  summary: {
    trading_day: string;
    total_checks: number;
    total_covers: number;
    net_sales: number;
    sub_total: number;
    total_tax: number;
    total_comps: number;
    total_voids: number;
  };
  salesByCategory: Array<{
    category: string;
    gross_sales: number;
    comps: number;
    voids: number;
    net_sales: number;
  }>;
  servers: Array<{
    employee_name: string;
    employee_role_name: string;
    tickets: number;
    covers: number;
    net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
  }>;
  menuItems: Array<{
    name: string;
    qty: number;
    net_total: number;
    parent_category: string;
  }>;
  discounts: Array<{
    reason: string;
    qty: number;
    amount: number;
  }>;
  detailedComps: Array<{
    check_id: string;
    table_name: string;
    server: string;
    comp_total: number;
    check_total: number;
    reason: string;
    comped_items: string[];
  }>;
  notableGuests: Array<{
    check_id: string;
    server: string;
    covers: number;
    payment: number;
    table_name: string;
    cardholder_name: string | null;
    tip_amount: number | null;
    tip_percent: number | null;
    items: string[];
    additional_items: number;
  }>;
  peopleWeKnow: Array<{
    first_name: string;
    last_name: string;
    is_vip: boolean;
    tags: string[] | null;
    party_size: number;
    total_payment: number;
    status: string;
  }>;
}

interface VenueMapping {
  venue_id: string;
  venue_name: string;
  tipsee_location_uuid: string;
}

interface CompException {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  check_id: string;
  table_name: string;
  server: string;
  comp_total: number;
  check_total: number;
  reason: string;
  comped_items: Array<{ name: string; quantity: number; amount: number }>;
  message: string;
  details: string;
}

interface CompExceptionSummary {
  date: string;
  total_comps: number;
  net_sales: number;
  comp_pct: number;
  comp_pct_status: 'ok' | 'warning' | 'critical';
  exception_count: number;
  critical_count: number;
  warning_count: number;
}

interface CompExceptionsData {
  summary: CompExceptionSummary;
  exceptions: CompException[];
}

interface CompReviewRecommendation {
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'violation' | 'training' | 'process' | 'policy' | 'positive';
  title: string;
  description: string;
  action: string;
  relatedComps?: string[];
}

interface CompReviewData {
  summary: {
    totalReviewed: number;
    approved: number;
    needsFollowup: number;
    urgent: number;
    overallAssessment: string;
  };
  recommendations: CompReviewRecommendation[];
  insights: string[];
}

interface FactsSummary {
  food_sales?: number;
  beverage_sales?: number;
  wine_sales?: number;
  liquor_sales?: number;
  beer_sales?: number;
  beverage_pct?: number;
  // Labor metrics
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
  // Prophet forecast
  forecast?: {
    net_sales: number | null;
    net_sales_lower: number | null;
    net_sales_upper: number | null;
    covers: number | null;
    covers_lower: number | null;
    covers_upper: number | null;
  };
  // Variance comparisons
  variance?: {
    vs_forecast_pct: number | null;
    vs_forecast_covers_pct: number | null;
    sdlw_net_sales: number | null;
    sdlw_covers: number | null;
    vs_sdlw_pct: number | null;
    vs_sdlw_covers_pct: number | null;
    sdly_net_sales: number | null;
    sdly_covers: number | null;
    vs_sdly_pct: number | null;
    vs_sdly_covers_pct: number | null;
    // PTD (Period-to-Date) - Fiscal period
    ptd_net_sales: number | null;
    ptd_covers: number | null;
    ptd_lw_net_sales: number | null;
    ptd_lw_covers: number | null;
    vs_ptd_pct: number | null;
    vs_ptd_covers_pct: number | null;
    // WTD (Week-to-Date) - Calendar week
    wtd_net_sales: number | null;
    wtd_covers: number | null;
    wtd_lw_net_sales: number | null;
    wtd_lw_covers: number | null;
    vs_wtd_pct: number | null;
    vs_wtd_covers_pct: number | null;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function VarianceBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (value === null || value === undefined) return null;
  const isPositive = value >= 0;
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
        {isPositive ? '+' : ''}{value.toFixed(1)}%
      </span>
      {isPositive ? (
        <TrendingUp className="h-3 w-3 text-emerald-500" />
      ) : (
        <TrendingDown className="h-3 w-3 text-red-500" />
      )}
    </div>
  );
}

export default function NightlyReportPage() {
  const { selectedVenue } = useVenue();
  const [date, setDate] = useState('');
  const [report, setReport] = useState<NightlyReportData | null>(null);
  const [factsSummary, setFactsSummary] = useState<FactsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<VenueMapping[]>([]);
  const [compNotes, setCompNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [compExceptions, setCompExceptions] = useState<CompExceptionsData | null>(null);
  const [compReview, setCompReview] = useState<CompReviewData | null>(null);
  const [loadingCompReview, setLoadingCompReview] = useState<boolean>(false);
  const [compReviewExpanded, setCompReviewExpanded] = useState<boolean>(false);

  // Set initial date on client only (avoids hydration mismatch)
  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setDate(yesterday.toISOString().split('T')[0]);
  }, []);

  // Fetch venue mappings on mount
  useEffect(() => {
    async function fetchMappings() {
      try {
        const res = await fetch('/api/nightly/facts?action=mappings');
        if (res.ok) {
          const data = await res.json();
          setMappings(data.mappings || []);
        }
      } catch (e) {
        console.error('Failed to fetch venue mappings:', e);
      }
    }
    fetchMappings();
  }, []);

  // Get TipSee location UUID from selected venue via mapping
  const currentMapping = mappings.find(m => m.venue_id === selectedVenue?.id);
  const locationUuid = currentMapping?.tipsee_location_uuid || null;
  const isAllVenues = selectedVenue?.id === 'all';

  // Fetch report when date or location changes
  useEffect(() => {
    async function fetchReport() {
      if (!selectedVenue?.id || !date) return;

      // Handle "All Venues" - nightly report requires a specific venue
      if (isAllVenues) {
        setError('Please select a specific venue for the nightly report');
        setReport(null);
        setFactsSummary(null);
        setLoading(false);
        return;
      }

      // Handle missing TipSee mapping
      if (!locationUuid) {
        setError(`No TipSee mapping found for ${selectedVenue.name}. Configure venue mappings to view this report.`);
        setReport(null);
        setFactsSummary(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setCompReview(null);
      setCompExceptions(null);
      setCompNotes({});
      try {
        // Fire ALL independent fetches in parallel — don't block on comp data
        const [liveRes, factsRes, notesRes, exceptionsRes] = await Promise.all([
          fetch(`/api/nightly?date=${date}&location=${locationUuid}`),
          fetch(`/api/nightly/facts?date=${date}&venue_id=${selectedVenue.id}`),
          fetch(`/api/nightly/comp-notes?venue_id=${selectedVenue.id}&business_date=${date}`, { credentials: 'include' }),
          fetch(`/api/nightly/comp-exceptions?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' }),
        ]);

        if (!liveRes.ok) {
          const errData = await liveRes.json();
          throw new Error(errData.error || 'Failed to fetch report');
        }
        const liveData = await liveRes.json();
        setReport(liveData);

        // Process facts (Supabase — fast)
        if (factsRes.ok) {
          const factsData = await factsRes.json();
          if (factsData.has_data) {
            setFactsSummary({
              ...factsData.summary,
              labor: factsData.labor,
              forecast: factsData.forecast,
              variance: factsData.variance,
            });
          } else {
            setFactsSummary(null);
          }
        }

        // Process comp notes (non-blocking)
        if (notesRes.ok) {
          const notesData = await notesRes.json();
          setCompNotes(notesData.notes || {});
        }

        // Process comp exceptions (non-blocking)
        if (exceptionsRes.ok) {
          const exceptionsData = await exceptionsRes.json();
          if (exceptionsData.success) {
            setCompExceptions(exceptionsData.data);
          }
        }

        // AI comp review fires AFTER page is visible (non-blocking)
        if (liveData?.summary?.total_comps > 0) {
          setLoadingCompReview(true);
          fetch(`/api/ai/comp-review?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data?.success) setCompReview(data.data); })
            .catch(err => console.error('AI comp review error:', err))
            .finally(() => setLoadingCompReview(false));
        }
      } catch (err: any) {
        setError(err.message);
        setReport(null);
        setFactsSummary(null);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [date, locationUuid, selectedVenue?.id, selectedVenue?.name, isAllVenues]);

  function changeDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  }

  async function saveCompNote(checkId: string, notes: string) {
    if (!selectedVenue?.id) return;
    setSavingNote(checkId);
    try {
      await fetch('/api/nightly/comp-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          venue_id: selectedVenue.id,
          business_date: date,
          check_id: checkId,
          notes,
        }),
      });
      setCompNotes((prev: Record<string, string>) => ({ ...prev, [checkId]: notes }));
    } catch (e) {
      console.error('Failed to save comp note:', e);
    } finally {
      setSavingNote(null);
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="page-header">Nightly Report</h1>
          <p className="text-muted-foreground">
            End-of-day operational summary from TipSee POS
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Navigation */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-md p-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => changeDate(-1)}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none text-sm font-medium px-2 focus:outline-none"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => changeDate(1)}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Venue Switcher */}
      <VenueQuickSwitcher />

      {/* Date Banner */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span className="font-medium">{formatDate(date)}</span>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brass" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-error">
          <CardContent className="p-6">
            <p className="text-error">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Report Content */}
      {!loading && !error && report && (
        <>
          {/* Executive Summary - Variance Block */}
          {factsSummary?.variance && (
            <Card className="bg-muted/30 border-brass/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-brass" />
                  <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Performance vs Benchmarks
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {/* Net Sales with variance - recalculate using live TipSee data */}
                  {(() => {
                    const liveNetSales = report.summary.net_sales || 0;
                    const liveCovers = report.summary.total_covers || 0;
                    const calcVar = (actual: number, comparison: number | null | undefined) => {
                      if (!comparison || comparison === 0) return null;
                      return ((actual - comparison) / comparison) * 100;
                    };
                    const sdlwSalesPct = calcVar(liveNetSales, factsSummary.variance.sdlw_net_sales);
                    const sdlySalesPct = calcVar(liveNetSales, factsSummary.variance.sdly_net_sales);
                    const sdlwCoversPct = calcVar(liveCovers, factsSummary.variance.sdlw_covers);
                    const sdlyCoversPct = calcVar(liveCovers, factsSummary.variance.sdly_covers);

                    return (
                      <>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold tabular-nums">
                            {formatCurrency(liveNetSales)}
                          </div>
                          <div className="text-xs text-muted-foreground uppercase">Net Sales</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <VarianceBadge value={sdlwSalesPct} label="SDLW" />
                            <VarianceBadge value={sdlySalesPct} label="SDLY" />
                          </div>
                        </div>
                        {/* Covers with variance */}
                        <div className="space-y-1">
                          <div className="text-2xl font-bold tabular-nums">
                            {formatNumber(liveCovers)}
                          </div>
                          <div className="text-xs text-muted-foreground uppercase">Covers</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <VarianceBadge value={sdlwCoversPct} label="SDLW" />
                            <VarianceBadge value={sdlyCoversPct} label="SDLY" />
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  {/* SDLW context */}
                  {factsSummary.variance.sdlw_net_sales && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums text-muted-foreground">
                        {formatCurrency(factsSummary.variance.sdlw_net_sales)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">SDLW</div>
                      <div className="text-xs text-muted-foreground">
                        {factsSummary.variance.sdlw_covers} covers
                      </div>
                    </div>
                  )}
                  {/* SDLY context */}
                  {factsSummary.variance.sdly_net_sales && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums text-muted-foreground">
                        {formatCurrency(factsSummary.variance.sdly_net_sales)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">SDLY</div>
                      <div className="text-xs text-muted-foreground">
                        {factsSummary.variance.sdly_covers} covers
                      </div>
                    </div>
                  )}
                  {/* WTD (Week-to-Date) - Calendar week Mon→Today */}
                  {factsSummary.variance.wtd_net_sales != null && factsSummary.variance.wtd_net_sales > 0 && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {formatCurrency(factsSummary.variance.wtd_net_sales)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">WTD</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(factsSummary.variance.wtd_covers || 0)} covers
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <VarianceBadge value={factsSummary.variance.vs_wtd_pct} label="$" />
                        <VarianceBadge value={factsSummary.variance.vs_wtd_covers_pct} label="cvrs" />
                      </div>
                    </div>
                  )}
                  {/* PTD (Period-to-Date) - Fiscal period start→Today */}
                  {factsSummary.variance.ptd_net_sales != null && factsSummary.variance.ptd_net_sales > 0 && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {formatCurrency(factsSummary.variance.ptd_net_sales)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">PTD</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(factsSummary.variance.ptd_covers || 0)} covers
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <VarianceBadge value={factsSummary.variance.vs_ptd_pct} label="$" />
                        <VarianceBadge value={factsSummary.variance.vs_ptd_covers_pct} label="cvrs" />
                      </div>
                    </div>
                  )}
                  {/* Labor efficiency preview */}
                  {factsSummary.labor && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {(factsSummary.labor.labor_pct || 0).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Labor %</div>
                      <div className="text-xs text-muted-foreground">
                        SPLH: {formatCurrency(factsSummary.labor.splh || 0)}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Stats - Single Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Avg/Cover"
              value={formatCurrency(
                report.summary.total_covers > 0
                  ? report.summary.net_sales / report.summary.total_covers
                  : 0
              )}
              icon={<TrendingUp className="h-5 w-5 text-sage" />}
            />
            <StatCard
              label="Comp %"
              value={`${report.summary.net_sales > 0 ? ((report.summary.total_comps / report.summary.net_sales) * 100).toFixed(1) : '0.0'}%`}
              icon={<Gift className="h-5 w-5 text-error" />}
            />
            {/* Food/Bev calculated from salesByCategory (live TipSee data) */}
            {(() => {
              // Calculate Food/Bev split from category data, then apply to actual net sales
              // Item-level gross doesn't match check-level net, so we use the ratio
              const categories = report.salesByCategory || [];
              const isBevCategory = (cat: string) => {
                const lower = (cat || '').toLowerCase();
                return lower.includes('bev') || lower.includes('wine') ||
                       lower.includes('beer') || lower.includes('liquor') ||
                       lower.includes('cocktail');
              };
              const foodGross = categories
                .filter((c: { category: string; net_sales: number }) => !isBevCategory(c.category))
                .reduce((sum: number, c: { net_sales: number }) => sum + (Number(c.net_sales) || 0), 0);
              const bevGross = categories
                .filter((c: { category: string; net_sales: number }) => isBevCategory(c.category))
                .reduce((sum: number, c: { net_sales: number }) => sum + (Number(c.net_sales) || 0), 0);

              // Calculate mix percentage (food vs bev)
              const totalCategoryGross = foodGross + bevGross;
              const foodPct = totalCategoryGross > 0 ? (foodGross / totalCategoryGross * 100) : 0;
              const bevPct = totalCategoryGross > 0 ? (bevGross / totalCategoryGross * 100) : 0;

              // Apply percentages to actual check-level net sales
              const actualNetSales = report.summary.net_sales || 0;
              const foodSales = actualNetSales * (foodPct / 100);
              const bevSales = actualNetSales * (bevPct / 100);

              return (
                <>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <UtensilsCrossed className="h-5 w-5 text-brass" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold tabular-nums">
                          {formatCurrency(foodSales)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          FOOD · {foodPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <DollarSign className="h-5 w-5 text-sage" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold tabular-nums">
                          {formatCurrency(bevSales)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          BEVERAGE · {bevPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </Card>
                </>
              );
            })()}
          </div>

          {/* Labor & Productivity */}
          {factsSummary?.labor && (() => {
            const labor = factsSummary.labor!;
            const otPct = labor.total_hours > 0 ? (labor.ot_hours / labor.total_hours) * 100 : 0;
            const avgRate = labor.total_hours > 0 ? labor.labor_cost / labor.total_hours : 0;
            const otCost = labor.ot_hours * avgRate * 1.5;
            const costPerCover = (report.summary.total_covers > 0)
              ? labor.labor_cost / report.summary.total_covers
              : 0;
            const hasOT = labor.ot_hours > 0;

            return (
              <Card>
                <CardHeader className="border-b border-brass/20 py-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-brass" />
                    Labor & Productivity
                    <span className="ml-auto text-sm font-normal text-muted-foreground">
                      {labor.employee_count || 0} employees
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {/* Primary KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {formatCurrency(labor.labor_cost || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Labor Cost</div>
                    </div>
                    <div className="space-y-1">
                      <div className={`text-2xl font-bold tabular-nums ${
                        (labor.labor_pct || 0) > 30 ? 'text-error' : (labor.labor_pct || 0) > 25 ? 'text-yellow-500' : ''
                      }`}>
                        {(labor.labor_pct || 0).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Labor %</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {formatCurrency(labor.splh || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">SPLH</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {labor.covers_per_labor_hour
                          ? labor.covers_per_labor_hour.toFixed(1)
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Covers/Hr</div>
                    </div>
                  </div>

                  {/* Hours & OT Row */}
                  <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 p-3 rounded-lg ${
                    hasOT ? 'bg-error/5 border border-error/20' : 'bg-muted/30'
                  }`}>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold tabular-nums">
                        {(labor.total_hours || 0).toFixed(1)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Total Hours</div>
                    </div>
                    <div className="space-y-1">
                      <div className={`text-lg font-semibold tabular-nums ${hasOT ? 'text-error' : ''}`}>
                        {(labor.ot_hours || 0).toFixed(1)}
                        {hasOT && (
                          <span className="text-sm ml-1">({otPct.toFixed(0)}%)</span>
                        )}
                      </div>
                      <div className={`text-xs uppercase ${hasOT ? 'text-error/70' : 'text-muted-foreground'}`}>
                        OT Hours
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className={`text-lg font-semibold tabular-nums ${hasOT ? 'text-error' : ''}`}>
                        {hasOT ? formatCurrency(otCost) : '$0'}
                      </div>
                      <div className={`text-xs uppercase ${hasOT ? 'text-error/70' : 'text-muted-foreground'}`}>
                        Est. OT Cost
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold tabular-nums">
                        {formatCurrency(costPerCover)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Cost/Cover</div>
                    </div>
                  </div>

                  {/* FOH / BOH Split */}
                  {(labor.foh || labor.boh) && (() => {
                    const fohHrs = labor.foh?.hours || 0;
                    const bohHrs = labor.boh?.hours || 0;
                    const otherHrs = labor.other?.hours || 0;
                    const totalHrs = fohHrs + bohHrs + otherHrs;
                    const fohPct = totalHrs > 0 ? (fohHrs / totalHrs) * 100 : 0;
                    const bohPct = totalHrs > 0 ? (bohHrs / totalHrs) * 100 : 0;
                    const otherPct = totalHrs > 0 ? (otherHrs / totalHrs) * 100 : 0;

                    return (
                      <div className="mt-4 space-y-3">
                        <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                          FOH / BOH Split
                        </div>
                        {/* Stacked bar */}
                        <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                          {fohPct > 0 && (
                            <div
                              className="bg-brass h-full transition-all"
                              style={{ width: `${fohPct}%` }}
                              title={`FOH: ${fohHrs.toFixed(1)}h (${fohPct.toFixed(0)}%)`}
                            />
                          )}
                          {bohPct > 0 && (
                            <div
                              className="bg-sage h-full transition-all"
                              style={{ width: `${bohPct}%` }}
                              title={`BOH: ${bohHrs.toFixed(1)}h (${bohPct.toFixed(0)}%)`}
                            />
                          )}
                          {otherPct > 0 && (
                            <div
                              className="bg-muted-foreground/30 h-full transition-all"
                              style={{ width: `${otherPct}%` }}
                              title={`Other: ${otherHrs.toFixed(1)}h (${otherPct.toFixed(0)}%)`}
                            />
                          )}
                        </div>
                        {/* Legend row */}
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          {labor.foh && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-brass flex-shrink-0" />
                              <div>
                                <div className="font-semibold">FOH</div>
                                <div className="text-xs text-muted-foreground">
                                  {fohHrs.toFixed(1)}h · {formatCurrency(labor.foh.cost)} · {labor.foh.employee_count} emp
                                </div>
                              </div>
                            </div>
                          )}
                          {labor.boh && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-sage flex-shrink-0" />
                              <div>
                                <div className="font-semibold">BOH</div>
                                <div className="text-xs text-muted-foreground">
                                  {bohHrs.toFixed(1)}h · {formatCurrency(labor.boh.cost)} · {labor.boh.employee_count} emp
                                </div>
                              </div>
                            </div>
                          )}
                          {labor.other && otherHrs > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                              <div>
                                <div className="font-semibold">Other</div>
                                <div className="text-xs text-muted-foreground">
                                  {otherHrs.toFixed(1)}h · {formatCurrency(labor.other.cost)} · {labor.other.employee_count} emp
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })()}

          {/* Comp Exceptions - Policy Violations */}
          {compExceptions && compExceptions.exceptions.length > 0 && (
            <Card className="border-error/50 bg-error/5">
              <CardHeader className="border-b border-error/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-error" />
                  Comp Policy Exceptions
                  <span className="ml-auto flex items-center gap-2">
                    {compExceptions.summary.critical_count > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-error text-white rounded">
                        {compExceptions.summary.critical_count} Critical
                      </span>
                    )}
                    {compExceptions.summary.warning_count > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-500 text-white rounded">
                        {compExceptions.summary.warning_count} Warning
                      </span>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Daily Comp % Status Banner */}
                {compExceptions.summary.comp_pct_status !== 'ok' && (
                  <div className={`px-4 py-3 border-b ${
                    compExceptions.summary.comp_pct_status === 'critical'
                      ? 'bg-error/10 border-error/20'
                      : 'bg-yellow-500/10 border-yellow-500/20'
                  }`}>
                    <div className="flex items-center gap-2">
                      <AlertOctagon className={`h-4 w-4 ${
                        compExceptions.summary.comp_pct_status === 'critical'
                          ? 'text-error'
                          : 'text-yellow-600'
                      }`} />
                      <span className="text-sm font-medium">
                        Daily comp % is {compExceptions.summary.comp_pct.toFixed(1)}% of net sales
                        {compExceptions.summary.comp_pct_status === 'critical'
                          ? ' (exceeds 3% threshold)'
                          : ' (exceeds 2% target)'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Exception List */}
                <div className="divide-y divide-border max-h-96 overflow-y-auto">
                  {compExceptions.exceptions.map((exc: CompException, i: number) => (
                    <div
                      key={`${exc.check_id}-${i}`}
                      className={`p-4 ${
                        exc.severity === 'critical'
                          ? 'bg-error/5 hover:bg-error/10'
                          : 'hover:bg-muted/50'
                      } transition-colors`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          {exc.severity === 'critical' ? (
                            <XCircle className="h-5 w-5 text-error mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-semibold ${
                                exc.severity === 'critical' ? 'text-error' : 'text-yellow-700'
                              }`}>
                                {exc.message}
                              </span>
                              <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                exc.severity === 'critical'
                                  ? 'bg-error/20 text-error'
                                  : 'bg-yellow-500/20 text-yellow-700'
                              }`}>
                                {exc.severity.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {exc.details}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>Table {exc.table_name}</span>
                              <span>•</span>
                              <span>Server: {exc.server}</span>
                              <span>•</span>
                              <span className="font-semibold text-error">
                                {formatCurrency(exc.comp_total)} comped
                              </span>
                            </div>
                            {exc.comped_items.length > 0 && (
                              <div className="mt-2 text-sm">
                                <span className="text-muted-foreground">Items: </span>
                                {exc.comped_items.map((item: { name: string; quantity: number; amount: number }, j: number) => (
                                  <span key={j}>
                                    {j > 0 && ', '}
                                    <span className={
                                      item.name.toLowerCase().includes('promo')
                                        ? 'text-yellow-700 font-medium'
                                        : ''
                                    }>
                                      {item.name}
                                    </span>
                                    {item.quantity > 1 && ` x${item.quantity}`}
                                    {' '}(${item.amount.toFixed(2)})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Comp Review */}
          {loadingCompReview && (
            <Card className="border-blue-500/50 bg-blue-500/5">
              <CardContent className="p-6">
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-sm text-muted-foreground">
                    AI is reviewing all comp activity...
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {compReview && !loadingCompReview && (
            <Card className="border-blue-500/50 bg-blue-500/5">
              <CardHeader
                className="border-b border-blue-500/20 cursor-pointer hover:bg-blue-500/10 transition-colors"
                onClick={() => setCompReviewExpanded(!compReviewExpanded)}
              >
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-500" />
                  AI Comp Review
                  <span className="ml-auto flex items-center gap-2">
                    {compReview.summary.urgent > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-error text-white rounded">
                        {compReview.summary.urgent} Urgent
                      </span>
                    )}
                    {compReview.summary.needsFollowup > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-500 text-white rounded">
                        {compReview.summary.needsFollowup} Follow-up
                      </span>
                    )}
                    {compReview.summary.approved > 0 && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-green-600 text-white rounded">
                        {compReview.summary.approved} Approved
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompReviewExpanded(!compReviewExpanded);
                      }}
                    >
                      {compReviewExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </span>
                </CardTitle>
              </CardHeader>
              {compReviewExpanded && (
                <CardContent className="p-0">
                  {/* Overall Assessment */}
                  <div className="px-4 py-3 border-b bg-blue-500/10 border-blue-500/20">
                  <p className="text-sm font-medium text-foreground">
                    {compReview.summary.overallAssessment}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{compReview.summary.totalReviewed} comps reviewed</span>
                  </div>
                </div>

                {/* Recommendations */}
                {compReview.recommendations.length > 0 && (
                  <div className="divide-y divide-border">
                    {compReview.recommendations.map((rec, i) => {
                      const priorityColors = {
                        urgent: {
                          bg: 'bg-error/5 hover:bg-error/10',
                          icon: 'text-error',
                          badge: 'bg-error/20 text-error',
                        },
                        high: {
                          bg: 'bg-yellow-500/5 hover:bg-yellow-500/10',
                          icon: 'text-yellow-600',
                          badge: 'bg-yellow-500/20 text-yellow-700',
                        },
                        medium: {
                          bg: 'bg-blue-500/5 hover:bg-blue-500/10',
                          icon: 'text-blue-600',
                          badge: 'bg-blue-500/20 text-blue-700',
                        },
                        low: {
                          bg: 'bg-green-500/5 hover:bg-green-500/10',
                          icon: 'text-green-600',
                          badge: 'bg-green-500/20 text-green-700',
                        },
                      };

                      const colors = priorityColors[rec.priority];
                      const Icon =
                        rec.priority === 'urgent'
                          ? XCircle
                          : rec.priority === 'high'
                          ? AlertTriangle
                          : rec.category === 'positive'
                          ? CheckCircle2
                          : Info;

                      return (
                        <div
                          key={i}
                          className={`p-4 ${colors.bg} transition-colors`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1">
                              <Icon className={`h-5 w-5 ${colors.icon} mt-0.5 flex-shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">{rec.title}</span>
                                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${colors.badge}`}>
                                    {rec.priority.toUpperCase()}
                                  </span>
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground">
                                    {rec.category}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {rec.description}
                                </p>
                                <div className="mt-2 p-2 bg-background/50 rounded text-sm">
                                  <span className="font-medium text-foreground">Action: </span>
                                  <span className="text-foreground">{rec.action}</span>
                                </div>
                                {rec.relatedComps && rec.relatedComps.length > 0 && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Related checks: {rec.relatedComps.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Insights */}
                {compReview.insights.length > 0 && (
                  <div className="p-4 border-t bg-muted/30">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Key Insights
                    </h4>
                    <ul className="space-y-1">
                      {compReview.insights.map((insight, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Server Performance */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-sage" />
                  Server Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {report.servers.length > 0 ? (
                  <table className="table-opsos">
                    <thead>
                      <tr>
                        <th>Server</th>
                        <th className="text-right">Covers</th>
                        <th className="text-right">Sales</th>
                        <th className="text-right">Avg/Cover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.servers.slice(0, 10).map((server, i) => (
                        <tr key={i}>
                          <td>
                            <div className="font-medium">{server.employee_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {server.employee_role_name}
                            </div>
                          </td>
                          <td className="text-right">{server.covers}</td>
                          <td className="text-right">{formatCurrency(server.net_sales || 0)}</td>
                          <td className="text-right">{formatCurrency(server.avg_per_cover || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No server data</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Menu Items */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-brass" />
                  Top Menu Items
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {report.menuItems.length > 0 ? (
                  (() => {
                    const isBeverage = (cat: string) => {
                      const lower = cat.toLowerCase();
                      return lower.includes('bev') || lower.includes('wine') ||
                             lower.includes('beer') || lower.includes('liquor') ||
                             lower.includes('cocktail');
                    };
                    const foodItems = report.menuItems.filter(item => !isBeverage(item.parent_category || ''));
                    const bevItems = report.menuItems.filter(item => isBeverage(item.parent_category || ''));

                    return (
                      <table className="table-opsos">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {foodItems.length > 0 && (
                            <>
                              <tr className="bg-muted/50">
                                <td colSpan={3} className="text-xs uppercase tracking-wide text-muted-foreground font-semibold py-2">
                                  Food
                                </td>
                              </tr>
                              {foodItems.map((item, i) => (
                                <tr key={`food-${i}`}>
                                  <td className="font-medium">{item.name}</td>
                                  <td className="text-right">{formatNumber(item.qty || 0)}</td>
                                  <td className="text-right">{formatCurrency(item.net_total || 0)}</td>
                                </tr>
                              ))}
                            </>
                          )}
                          {bevItems.length > 0 && (
                            <>
                              <tr className="bg-muted/50">
                                <td colSpan={3} className="text-xs uppercase tracking-wide text-muted-foreground font-semibold py-2">
                                  Beverage
                                </td>
                              </tr>
                              {bevItems.map((item, i) => (
                                <tr key={`bev-${i}`}>
                                  <td className="font-medium">{item.name}</td>
                                  <td className="text-right">{formatNumber(item.qty || 0)}</td>
                                  <td className="text-right">{formatCurrency(item.net_total || 0)}</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    );
                  })()
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No menu items</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comps & Discounts */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-5 w-5 text-error" />
                  Comps & Discounts
                  {report.summary.total_comps > 0 && (
                    <span className="ml-auto text-sm font-normal text-error">
                      {formatCurrency(report.summary.total_comps)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(report.discounts.length > 0 || report.detailedComps.length > 0) ? (
                  <Tabs defaultValue="by-reason" className="w-full">
                    <div className="px-4 pt-3">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="by-reason">By Reason</TabsTrigger>
                        <TabsTrigger value="all-comps">All Comps ({report.detailedComps.length})</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="by-reason" className="mt-0">
                      {report.discounts.length > 0 ? (
                        (() => {
                          const totalComps = report.discounts.reduce((sum, d) => sum + (d.amount || 0), 0);
                          const compPct = report.summary.net_sales > 0
                            ? ((totalComps / report.summary.net_sales) * 100).toFixed(1)
                            : '0.0';
                          return (
                            <>
                              <div className="px-4 py-3 border-b border-border bg-muted/30">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-muted-foreground">Comp % of Net Sales</span>
                                  <span className="text-lg font-semibold text-error">{compPct}%</span>
                                </div>
                              </div>
                              <table className="table-opsos">
                                <thead>
                                  <tr>
                                    <th>Reason</th>
                                    <th className="text-right">Qty</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {report.discounts.map((disc, i) => {
                                    const pct = totalComps > 0
                                      ? ((disc.amount || 0) / totalComps * 100).toFixed(0)
                                      : '0';
                                    return (
                                      <tr key={i}>
                                        <td className="font-medium">{disc.reason}</td>
                                        <td className="text-right">{disc.qty}</td>
                                        <td className="text-right text-error">{formatCurrency(disc.amount || 0)}</td>
                                        <td className="text-right text-muted-foreground">{pct}%</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </>
                          );
                        })()
                      ) : (
                        <div className="empty-state py-8">
                          <p className="text-muted-foreground">No comps by reason</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="all-comps" className="mt-0">
                      {report.detailedComps.length > 0 ? (
                        <div className="divide-y divide-border">
                          {report.detailedComps.map((comp, i) => (
                            <div key={i} className="p-4 hover:bg-muted/50 transition-colors">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-semibold text-error">
                                    {formatCurrency(comp.comp_total || 0)} comped
                                  </span>
                                  <span className="text-muted-foreground text-sm ml-2">
                                    of {formatCurrency(comp.check_total || 0)} total
                                  </span>
                                </div>
                                <span className="badge-error">{comp.reason}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Table {comp.table_name} | Server: {comp.server}
                              </div>
                              {comp.comped_items.length > 0 && (
                                <div className="mt-2 text-sm">
                                  {comp.comped_items.join(', ')}
                                </div>
                              )}
                              <Input
                                type="text"
                                placeholder="Add manager note..."
                                defaultValue={compNotes[comp.check_id] || ''}
                                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                                  const newValue = e.target.value.trim();
                                  if (newValue !== (compNotes[comp.check_id] || '')) {
                                    saveCompNote(comp.check_id, newValue);
                                  }
                                }}
                                className={`mt-2 h-8 text-sm ${savingNote === comp.check_id ? 'opacity-50' : ''}`}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state py-8">
                          <p className="text-muted-foreground">No detailed comps</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No comps</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* VIP Activity */}
          <Card>
            <CardHeader className="border-b border-brass/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-brass" />
                VIP Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(report.notableGuests.length > 0 || report.peopleWeKnow.length > 0) ? (
                <Tabs defaultValue="top-spenders" className="w-full">
                  <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                    <TabsTrigger
                      value="top-spenders"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-brass data-[state=active]:bg-transparent"
                    >
                      Top Spenders ({report.notableGuests.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="vips"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-brass data-[state=active]:bg-transparent"
                    >
                      VIPs ({report.peopleWeKnow.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="top-spenders" className="mt-0">
                    {report.notableGuests.length > 0 ? (
                      <div className="divide-y divide-border">
                        {report.notableGuests.map((guest, i) => (
                          <div key={i} className="p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="font-semibold text-lg">
                                  {formatCurrency(guest.payment || 0)}
                                </span>
                                <span className="text-muted-foreground text-sm ml-2">
                                  Table {guest.table_name}
                                </span>
                              </div>
                              <div className="text-right">
                                {guest.cardholder_name && (
                                  <div className="font-medium">{guest.cardholder_name}</div>
                                )}
                                {guest.tip_percent !== null && (
                                  <div className="text-sm text-sage">
                                    {guest.tip_percent}% tip
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span>Server: {guest.server}</span>
                              <span className="mx-2">|</span>
                              <span>{guest.covers} covers</span>
                            </div>
                            {guest.items.length > 0 && (
                              <div className="mt-2 text-sm">
                                {guest.items.join(', ')}
                                {guest.additional_items > 0 && (
                                  <span className="text-muted-foreground">
                                    {' '}+{guest.additional_items} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state py-8">
                        <p className="text-muted-foreground">No top spenders</p>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="vips" className="mt-0">
                    {report.peopleWeKnow.length > 0 ? (
                      <table className="table-opsos">
                        <thead>
                          <tr>
                            <th>Guest</th>
                            <th>Party</th>
                            <th className="text-right">Spent</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.peopleWeKnow.map((person, i) => (
                            <tr key={i}>
                              <td>
                                <div className="flex items-center gap-2">
                                  {person.is_vip && (
                                    <span className="badge-brass">VIP</span>
                                  )}
                                  <span className="font-medium">
                                    {person.first_name} {person.last_name}
                                  </span>
                                </div>
                                {person.tags && person.tags.length > 0 && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {person.tags.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td>{person.party_size}</td>
                              <td className="text-right">
                                {formatCurrency(person.total_payment || 0)}
                              </td>
                              <td>
                                <span className="badge-sage">{person.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-state py-8">
                        <p className="text-muted-foreground">No VIPs</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="empty-state py-8">
                  <p className="text-muted-foreground">No VIP activity</p>
                </div>
              )}
            </CardContent>
          </Card>

        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-muted">{icon}</div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
        </div>
      </div>
    </Card>
  );
}
