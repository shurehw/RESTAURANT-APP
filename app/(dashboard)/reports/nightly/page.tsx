/**
 * Nightly Report Page
 * Shows end-of-day operational data from TipSee POS
 */

'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { useAttestation } from '@/components/attestation/useAttestation';
import { RevenueAttestation } from '@/components/attestation/RevenueAttestation';
import { LaborAttestation } from '@/components/attestation/LaborAttestation';
import { CompResolutionPanel } from '@/components/attestation/CompResolutionPanel';
import { AttestationFooter } from '@/components/attestation/AttestationFooter';
import { ServerDetailModal } from '@/components/reports/ServerDetailModal';
import type { NightlyReportPayload } from '@/lib/attestation/types';

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
    tip_pct: number | null;
    total_tips: number;
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

interface VenueHealthData {
  health_score: number;
  status: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  confidence: number;
  signal_count: number;
  top_drivers: Array<{
    signal: string;
    risk: number;
    weight: number;
    impact: number;
    reason: string;
  }> | null;
  open_actions: number;
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
  // Aggregated server performance
  servers_wtd?: Array<{
    employee_name: string;
    employee_role_name: string;
    tickets: number;
    covers: number;
    net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
    tip_pct: number | null;
    total_tips: number;
    days_worked: number;
  }>;
  servers_ptd?: Array<{
    employee_name: string;
    employee_role_name: string;
    tickets: number;
    covers: number;
    net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
    tip_pct: number | null;
    total_tips: number;
    days_worked: number;
  }>;
  // Period aggregations for categories
  categories_wtd?: Array<{
    category: string;
    gross_sales: number;
    comps: number;
    voids: number;
    net_sales: number;
    quantity: number;
  }>;
  categories_ptd?: Array<{
    category: string;
    gross_sales: number;
    comps: number;
    voids: number;
    net_sales: number;
    quantity: number;
  }>;
  // Period aggregations for menu items
  items_wtd?: Array<{
    name: string;
    qty: number;
    net_total: number;
    category: string;
  }>;
  items_ptd?: Array<{
    name: string;
    qty: number;
    net_total: number;
    category: string;
  }>;
  // Period aggregations for labor
  labor_wtd?: {
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
  labor_ptd?: {
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
  // Fiscal calendar info
  fiscal?: {
    calendar_type: string;
    fy_start_date: string | null;
    fiscal_year: number;
    fiscal_quarter: number;
    fiscal_period: number;
    period_start_date: string;
    period_end_date: string;
    week_in_period: number;
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
  const searchParams = useSearchParams();
  const router = useRouter();

  // Global view mode state (synchronized with URL)
  const [viewMode, setViewMode] = useState<'nightly' | 'wtd' | 'ptd'>(
    (searchParams.get('view') as 'nightly' | 'wtd' | 'ptd') || 'nightly'
  );

  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [report, setReport] = useState<NightlyReportData | null>(null);
  const [factsSummary, setFactsSummary] = useState<FactsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<VenueMapping[]>([]);
  const [compNotes, setCompNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [compExceptions, setCompExceptions] = useState<CompExceptionsData | null>(null);
  const [compReview, setCompReview] = useState<CompReviewData | null>(null);
  const [loadingCompReview, setLoadingCompReview] = useState<boolean>(false);
  const [compReviewExpanded, setCompReviewExpanded] = useState<boolean>(false);
  const [selectedServer, setSelectedServer] = useState<NightlyReportData['servers'][0] | null>(null);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [laborExceptions, setLaborExceptions] = useState<any | null>(null);
  const [loadingLaborExceptions, setLoadingLaborExceptions] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<VenueHealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(false);

  // Handler for view mode changes (updates URL)
  function handleViewChange(newView: 'nightly' | 'wtd' | 'ptd') {
    setViewMode(newView);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', newView);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  // Helper: Get period start date for WTD/PTD
  function getPeriodStart(endDate: string, mode: 'wtd' | 'ptd'): string {
    if (mode === 'wtd') {
      // Calculate Monday of current week
      const dateObj = new Date(endDate + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(dateObj);
      monday.setDate(monday.getDate() - daysFromMonday);
      return monday.toISOString().split('T')[0];
    } else {
      // PTD: Use fiscal period start from factsSummary
      return factsSummary?.fiscal?.period_start_date || endDate;
    }
  }

  // Helper: Format date for display
  function formatDateDisplay(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Compute team averages for server comparison (based on active view mode)
  const serverTeamAverages = React.useMemo(() => {
    const servers = viewMode === 'nightly'
      ? report?.servers
      : viewMode === 'wtd'
        ? factsSummary?.servers_wtd
        : factsSummary?.servers_ptd;
    if (!servers?.length) return null;
    const count = servers.length;
    const withTips = servers.filter((s) => s.tip_pct != null && s.tip_pct !== undefined);
    return {
      avg_covers: servers.reduce((sum, s) => sum + s.covers, 0) / count,
      avg_net_sales: servers.reduce((sum, s) => sum + s.net_sales, 0) / count,
      avg_ticket: servers.reduce((sum, s) => sum + s.avg_ticket, 0) / count,
      avg_turn_mins: servers.reduce((sum, s) => sum + (s.avg_turn_mins || 0), 0) / count,
      avg_per_cover: servers.reduce((sum, s) => sum + s.avg_per_cover, 0) / count,
      avg_tip_pct: withTips.length > 0
        ? withTips.reduce((sum, s) => sum + s.tip_pct!, 0) / withTips.length
        : null,
      server_count: count,
    };
  }, [report?.servers, factsSummary?.servers_wtd, factsSummary?.servers_ptd, viewMode]);

  // Build attestation report payload (memoised to avoid re-triggering hook)
  const attestationReportData: NightlyReportPayload | null = React.useMemo(() => {
    if (!report || !selectedVenue?.id || !date) return null;
    return {
      venue_id: selectedVenue.id,
      business_date: date,
      net_sales: report.summary.net_sales,
      forecasted_sales: factsSummary?.forecast?.net_sales || 0,
      total_comp_amount: report.summary.total_comps,
      comp_count: report.detailedComps?.length || 0,
      comps: (report.detailedComps || []).map(c => ({
        check_id: c.check_id,
        check_amount: c.check_total,
        comp_amount: c.comp_total,
        comp_reason: c.reason,
        employee_name: c.server,
      })),
      actual_labor_cost: factsSummary?.labor?.labor_cost || 0,
      scheduled_labor_cost: 0,
      overtime_hours: factsSummary?.labor?.ot_hours || 0,
      walkout_count: 0,
    };
  }, [report, selectedVenue?.id, date, factsSummary]);

  // Attestation hook — lifted to page level so inline modules share state
  const att = useAttestation(selectedVenue?.id, date, attestationReportData);

  // Note: date is initialized to yesterday via useState initializer

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

      // Handle missing TipSee mapping (but only after mappings have loaded)
      if (!locationUuid && mappings.length > 0) {
        setError(`No TipSee mapping found for ${selectedVenue.name}. Configure venue mappings to view this report.`);
        setReport(null);
        setFactsSummary(null);
        setLoading(false);
        return;
      }

      // Still waiting for mappings to load
      if (!locationUuid) {
        return;
      }

      setLoading(true);
      setError(null);
      setCompReview(null);
      setCompExceptions(null);
      setCompNotes({});
      try {
        // CRITICAL PATH: Only block on essential TipSee report data and comp notes
        const [liveRes, notesRes] = await Promise.all([
          fetch(`/api/nightly?date=${date}&location=${locationUuid}`),
          fetch(`/api/nightly/comp-notes?venue_id=${selectedVenue.id}&business_date=${date}`, { credentials: 'include' }),
        ]);

        if (!liveRes.ok) {
          const errData = await liveRes.json();
          throw new Error(errData.error || 'Failed to fetch report');
        }
        const liveData = await liveRes.json();
        setReport(liveData);

        // Process comp notes
        if (notesRes.ok) {
          const notesData = await notesRes.json();
          setCompNotes(notesData.notes || {});
        }

        // NON-BLOCKING: Fetch facts asynchronously (14 Supabase queries, can take time)
        setLoadingFacts(true);
        setFactsError(null);
        fetch(`/api/nightly/facts?date=${date}&venue_id=${selectedVenue.id}`, { credentials: 'include' })
          .then(res => {
            if (!res.ok) {
              throw new Error(`Facts API returned ${res.status}`);
            }
            return res.json();
          })
          .then(factsData => {
            if (factsData?.has_data) {
              setFactsSummary({
                ...factsData.summary,
                labor: factsData.labor,
                forecast: factsData.forecast,
                variance: factsData.variance,
                servers_wtd: factsData.servers_wtd,
                servers_ptd: factsData.servers_ptd,
              });
              setFactsError(null);
            } else {
              setFactsSummary(null);
              setFactsError('No fact data available for this date');
            }
          })
          .catch(err => {
            console.error('Facts fetch error:', err);
            setFactsError(err.message || 'Failed to load analytics data');
            setFactsSummary(null);
          })
          .finally(() => setLoadingFacts(false));

        // Fetch comp exceptions AFTER liveData is available, then trigger AI review
        if (liveData) {
          fetch(`/api/nightly/comp-exceptions?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              const parsedExceptions = data?.success ? data.data : null;
              if (parsedExceptions) {
                setCompExceptions(parsedExceptions);
              }

              // AI comp review fires AFTER exceptions are loaded (uses pre-fetched data)
              // Only run in nightly mode - period views don't have check-level detail
              if (viewMode === 'nightly' && liveData.summary?.total_comps > 0) {
                setLoadingCompReview(true);
                return fetch('/api/ai/comp-review', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    date,
                    venue_id: selectedVenue.id,
                    venue_name: selectedVenue.name,
                    detailedComps: liveData.detailedComps,
                    exceptions: parsedExceptions,
                    summary: liveData.summary,
                  }),
                });
              }
            })
            .then(res => res && res.ok ? res.json() : null)
            .then(data => { if (data?.success) setCompReview(data.data); })
            .catch(err => console.error('Comp exceptions/AI review error:', err))
            .finally(() => setLoadingCompReview(false));
        }

        // Fetch labor exceptions (non-blocking, only for nightly view)
        if (viewMode === 'nightly') {
          setLoadingLaborExceptions(true);
          fetch(`/api/labor/exceptions?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.success && data?.data?.has_data) {
                setLaborExceptions(data.data);
              } else {
                setLaborExceptions(null);
              }
            })
            .catch(err => {
              console.error('Labor exceptions fetch error:', err);
              setLaborExceptions(null);
            })
            .finally(() => setLoadingLaborExceptions(false));
        }

        // Fetch venue health score (non-blocking, all view modes)
        setLoadingHealth(true);
        fetch(`/api/health?view=daily&date=${date}&venue_id=${selectedVenue.id}`, { credentials: 'include' })
          .then(res => {
            if (!res.ok) throw new Error(`Health API returned ${res.status}`);
            return res.json();
          })
          .then(healthResponse => {
            // Extract single venue health from response
            if (healthResponse?.venues && healthResponse.venues.length > 0) {
              const venueHealth = healthResponse.venues[0];
              setHealthData({
                health_score: venueHealth.latest_score || 0,
                status: venueHealth.status || 'YELLOW',
                confidence: venueHealth.daily?.[0]?.confidence || 0,
                signal_count: venueHealth.daily?.[0]?.signal_count || 0,
                top_drivers: venueHealth.latest_drivers || null,
                open_actions: 0, // TODO: fetch from health actions if needed
              });
            } else {
              setHealthData(null);
            }
          })
          .catch(err => {
            console.error('[nightly] Health fetch failed:', err);
            setHealthData(null); // Graceful degradation - health is nice-to-have
          })
          .finally(() => setLoadingHealth(false));

      } catch (err: any) {
        setError(err.message);
        setReport(null);
        setFactsSummary(null);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [date, locationUuid, selectedVenue?.id, selectedVenue?.name, isAllVenues, mappings.length]);

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

          {/* Global View Mode Switcher */}
          <Tabs value={viewMode} onValueChange={(v) => handleViewChange(v as 'nightly' | 'wtd' | 'ptd')}>
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="nightly">Nightly</TabsTrigger>
              <TabsTrigger value="wtd">Week to Date</TabsTrigger>
              <TabsTrigger value="ptd">Period to Date</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Quick Venue Switcher */}
      <VenueQuickSwitcher />

      {/* Period Date Range Banner */}
      {viewMode !== 'nightly' && factsSummary && (
        <Card className="p-4 mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {viewMode === 'wtd' ? 'Week to Date' : 'Period to Date'}:
            {' '}{formatDateDisplay(getPeriodStart(date, viewMode))} → {formatDateDisplay(date)}
          </p>
        </Card>
      )}

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
      {error && !loading && (
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
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-brass" />
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Performance vs Benchmarks
                    </span>
                  </div>
                  {/* Venue Health Score Badge */}
                  {healthData && (
                    <a
                      href="/reports/health"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                      style={{
                        backgroundColor:
                          healthData.status === 'GREEN' ? '#10b98120' :
                          healthData.status === 'YELLOW' ? '#f5970620' :
                          healthData.status === 'ORANGE' ? '#f9731620' :
                          '#ef444420',
                        border: `1.5px solid ${
                          healthData.status === 'GREEN' ? '#10b981' :
                          healthData.status === 'YELLOW' ? '#f59706' :
                          healthData.status === 'ORANGE' ? '#f97316' :
                          '#ef4444'
                        }`,
                      }}
                    >
                      <Activity className="h-4 w-4" style={{
                        color:
                          healthData.status === 'GREEN' ? '#10b981' :
                          healthData.status === 'YELLOW' ? '#f59706' :
                          healthData.status === 'ORANGE' ? '#f97316' :
                          '#ef4444'
                      }} />
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold" style={{
                          color:
                            healthData.status === 'GREEN' ? '#10b981' :
                            healthData.status === 'YELLOW' ? '#f59706' :
                            healthData.status === 'ORANGE' ? '#f97316' :
                            '#ef4444'
                        }}>
                          Health: {Math.round(healthData.health_score)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {healthData.status}
                        </span>
                      </div>
                      <ArrowUpRight className="h-3 w-3 opacity-50" />
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {/* Net Sales with variance - recalculate using live TipSee data */}
                  {(() => {
                    // Select data source based on view mode
                    const liveNetSales = viewMode === 'nightly'
                      ? (report.summary.net_sales || 0)
                      : viewMode === 'wtd'
                        ? (factsSummary?.variance.wtd_net_sales || 0)
                        : (factsSummary?.variance.ptd_net_sales || 0);
                    const liveCovers = viewMode === 'nightly'
                      ? (report.summary.total_covers || 0)
                      : viewMode === 'wtd'
                        ? (factsSummary?.variance.wtd_covers || 0)
                        : (factsSummary?.variance.ptd_covers || 0);
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
                  {(() => {
                    const laborPreview = viewMode === 'nightly'
                      ? factsSummary.labor
                      : viewMode === 'wtd'
                        ? factsSummary?.labor_wtd
                        : factsSummary?.labor_ptd;

                    if (!laborPreview) return null;

                    return (
                      <div className="space-y-1">
                        <div className="text-2xl font-bold tabular-nums">
                          {(laborPreview.labor_pct || 0).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground uppercase">Labor %</div>
                        <div className="text-xs text-muted-foreground">
                          SPLH: {formatCurrency(laborPreview.splh || 0)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Revenue Attestation — inline after revenue summary */}
          {att.attestation && (
            <div className="border-l-2 border-brass/30 pl-4 ml-2">
              <RevenueAttestation
                triggers={att.triggers}
                attestation={att.attestation}
                onUpdate={att.updateField}
                disabled={att.isLocked}
              />
            </div>
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
              // Select category data based on view mode
              const categories = viewMode === 'nightly'
                ? (report.salesByCategory || [])
                : viewMode === 'wtd'
                  ? (factsSummary?.categories_wtd || [])
                  : (factsSummary?.categories_ptd || []);

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

              // Use period-appropriate net sales
              const actualNetSales = viewMode === 'nightly'
                ? (report.summary.net_sales || 0)
                : viewMode === 'wtd'
                  ? (factsSummary?.variance.wtd_net_sales || 0)
                  : (factsSummary?.variance.ptd_net_sales || 0);
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
          {(() => {
            // Select labor data based on view mode
            const labor = viewMode === 'nightly'
              ? factsSummary?.labor
              : viewMode === 'wtd'
                ? factsSummary?.labor_wtd
                : factsSummary?.labor_ptd;

            if (!labor) return null;

            const otPct = labor.total_hours > 0 ? (labor.ot_hours / labor.total_hours) * 100 : 0;
            const avgRate = labor.total_hours > 0 ? labor.labor_cost / labor.total_hours : 0;
            const otCost = labor.ot_hours * avgRate * 1.5;

            // Use period-appropriate covers for cost per cover calculation
            const periodCovers = viewMode === 'nightly'
              ? report.summary.total_covers
              : viewMode === 'wtd'
                ? (factsSummary?.variance.wtd_covers || 0)
                : (factsSummary?.variance.ptd_covers || 0);
            const costPerCover = periodCovers > 0 ? labor.labor_cost / periodCovers : 0;
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
                    const fohCost = labor.foh?.cost || 0;
                    const bohCost = labor.boh?.cost || 0;
                    const otherCost = labor.other?.cost || 0;
                    // Use period-appropriate net sales
                    const netSales = viewMode === 'nightly'
                      ? (report.summary.net_sales || 0)
                      : viewMode === 'wtd'
                        ? (factsSummary?.variance.wtd_net_sales || 0)
                        : (factsSummary?.variance.ptd_net_sales || 0);
                    // % of sales labels
                    const fohPct = netSales > 0 ? (fohCost / netSales) * 100 : 0;
                    const bohPct = netSales > 0 ? (bohCost / netSales) * 100 : 0;
                    const otherPct = netSales > 0 ? (otherCost / netSales) * 100 : 0;
                    // Bar widths: proportional share of total labor (fills 100%)
                    const totalCost = fohCost + bohCost + otherCost;
                    const fohBar = totalCost > 0 ? (fohCost / totalCost) * 100 : 0;
                    const bohBar = totalCost > 0 ? (bohCost / totalCost) * 100 : 0;
                    const otherBar = totalCost > 0 ? (otherCost / totalCost) * 100 : 0;

                    return (
                      <div className="mt-4 space-y-3">
                        <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                          FOH / BOH Split
                        </div>
                        {/* Stacked bar */}
                        <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                          {fohBar > 0 && (
                            <div
                              className="bg-brass h-full transition-all"
                              style={{ width: `${fohBar}%` }}
                              title={`FOH: ${fohPct.toFixed(1)}% of sales`}
                            />
                          )}
                          {bohBar > 0 && (
                            <div
                              className="bg-sage h-full transition-all"
                              style={{ width: `${bohBar}%` }}
                              title={`BOH: ${bohPct.toFixed(1)}% of sales`}
                            />
                          )}
                          {otherBar > 0 && (
                            <div
                              className="bg-muted-foreground/30 h-full transition-all"
                              style={{ width: `${otherBar}%` }}
                              title={`Other: ${otherPct.toFixed(1)}% of sales`}
                            />
                          )}
                        </div>
                        {/* Legend row */}
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          {labor.foh && (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-brass flex-shrink-0" />
                              <div>
                                <div className="font-semibold">FOH <span className="font-normal text-muted-foreground">{fohPct.toFixed(0)}%</span></div>
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
                                <div className="font-semibold">BOH <span className="font-normal text-muted-foreground">{bohPct.toFixed(0)}%</span></div>
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
                                <div className="font-semibold">Other <span className="font-normal text-muted-foreground">{otherPct.toFixed(0)}%</span></div>
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

                  {/* Labor Exceptions & Diagnostics (Nightly only) */}
                  {viewMode === 'nightly' && laborExceptions && laborExceptions.exceptions && laborExceptions.exceptions.length > 0 && (
                    <div className="mt-4 space-y-3 p-3 rounded-lg border border-error/20 bg-error/5">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                          Labor Efficiency Exceptions
                        </div>
                        {laborExceptions.requires_structural_review && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-error text-white">
                            STRUCTURAL REVIEW REQUIRED
                          </span>
                        )}
                      </div>

                      {/* Diagnostic Badge */}
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold ${
                          laborExceptions.diagnostic === 'overstaffed_slow'
                            ? 'bg-error text-white'
                            : laborExceptions.diagnostic === 'overstaffed_busy'
                              ? 'bg-yellow-500 text-white'
                              : laborExceptions.diagnostic === 'understaffed_or_pacing'
                                ? 'bg-orange-500 text-white'
                                : 'bg-sage text-white'
                        }`}>
                          {laborExceptions.diagnostic === 'overstaffed_slow' && '⚠️ Overstaffed + Slow'}
                          {laborExceptions.diagnostic === 'overstaffed_busy' && '⚡ Overstaffed (Busy)'}
                          {laborExceptions.diagnostic === 'understaffed_or_pacing' && '🔄 Understaffed/Pacing'}
                          {laborExceptions.diagnostic === 'efficient' && '✓ Efficient'}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          SPLH: ${laborExceptions.splh?.toFixed(0) || '—'} ·
                          CPLH: {laborExceptions.cplh?.toFixed(1) || '—'} ·
                          Labor %: {laborExceptions.labor_pct?.toFixed(1) || '—'}%
                        </div>
                      </div>

                      {/* Exception List */}
                      <div className="space-y-2">
                        {laborExceptions.exceptions.map((ex: any, idx: number) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                              ex.severity === 'critical' || ex.severity === 'structural'
                                ? 'bg-error/10'
                                : 'bg-yellow-500/10'
                            }`}
                          >
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0 ${
                              ex.severity === 'critical' || ex.severity === 'structural'
                                ? 'bg-error text-white'
                                : 'bg-yellow-500 text-white'
                            }`}>
                              {ex.severity === 'critical' || ex.severity === 'structural' ? '!' : '⚠'}
                            </span>
                            <div className="flex-1">
                              <div className="font-semibold text-xs uppercase text-muted-foreground mb-0.5">
                                {ex.type.replace(/_/g, ' ')}
                              </div>
                              <div className="text-sm">{ex.message}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Labor Attestation — inline after labor card */}
          {att.attestation && (
            <div className="border-l-2 border-brass/30 pl-4 ml-2">
              <LaborAttestation
                triggers={att.triggers}
                attestation={att.attestation}
                onUpdate={att.updateField}
                disabled={att.isLocked}
              />
            </div>
          )}

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

          {/* Comp Resolution Attestation — inline after comp analysis */}
          {att.attestation && (
            <div className="border-l-2 border-brass/30 pl-4 ml-2">
              <CompResolutionPanel
                triggers={att.triggers}
                resolutions={att.compResolutions}
                onAdd={att.addCompResolution}
                disabled={att.isLocked}
              />
            </div>
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
                {(() => {
                  // Show loading state for WTD/PTD when facts are loading
                  if (viewMode !== 'nightly' && loadingFacts) {
                    return (
                      <div className="empty-state py-8">
                        <p className="text-muted-foreground">Loading {viewMode.toUpperCase()} data...</p>
                      </div>
                    );
                  }

                  // Show error state for WTD/PTD if facts failed
                  if (viewMode !== 'nightly' && factsError) {
                    return (
                      <div className="empty-state py-8">
                        <p className="text-destructive text-sm">{factsError}</p>
                        <p className="text-muted-foreground text-xs mt-2">Try refreshing the page</p>
                      </div>
                    );
                  }

                  const serverData = viewMode === 'nightly'
                    ? report.servers
                    : viewMode === 'wtd'
                      ? factsSummary?.servers_wtd || []
                      : factsSummary?.servers_ptd || [];
                  const showDays = viewMode !== 'nightly';

                  if (serverData.length === 0) {
                    return (
                      <div className="empty-state py-8">
                        <p className="text-muted-foreground">
                          {viewMode === 'nightly' ? 'No server data' : `No ${viewMode.toUpperCase()} data available`}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <table className="table-opsos">
                      <thead>
                        <tr>
                          <th>Server</th>
                          <th className="text-right">Covers</th>
                          <th className="text-right">Sales</th>
                          <th className="text-right">Avg/Cover</th>
                          <th className="text-right">Tip %</th>
                          {showDays && <th className="text-right">Days</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {serverData.slice(0, 15).map((server, i) => (
                          <tr
                            key={i}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              setSelectedServer(server);
                              setServerModalOpen(true);
                            }}
                          >
                            <td>
                              <div className="font-medium">{server.employee_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {server.employee_role_name}
                              </div>
                            </td>
                            <td className="text-right">{server.covers}</td>
                            <td className="text-right">{formatCurrency(server.net_sales || 0)}</td>
                            <td className="text-right">{formatCurrency(server.avg_per_cover || 0)}</td>
                            <td className="text-right">
                              {server.tip_pct != null ? `${server.tip_pct}%` : '---'}
                            </td>
                            {showDays && (
                              <td className="text-right">
                                {(server as any).days_worked ?? '---'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
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
                {(() => {
                  // Select data source based on view mode
                  const menuItems = viewMode === 'nightly'
                    ? report.menuItems
                    : viewMode === 'wtd'
                      ? (factsSummary?.items_wtd || [])
                      : (factsSummary?.items_ptd || []);

                  if (menuItems.length === 0) {
                    return (
                      <div className="empty-state py-8">
                        <p className="text-muted-foreground">No menu items</p>
                      </div>
                    );
                  }

                  const isBeverage = (cat: string) => {
                    const lower = cat.toLowerCase();
                    return lower.includes('bev') || lower.includes('wine') ||
                           lower.includes('beer') || lower.includes('liquor') ||
                           lower.includes('cocktail');
                  };

                  // Handle both TipSee data (parent_category) and facts data (category)
                  const foodItems = menuItems.filter(item =>
                    !isBeverage((item as any).parent_category || item.category || '')
                  );
                  const bevItems = menuItems.filter(item =>
                    isBeverage((item as any).parent_category || item.category || '')
                  );

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
                })()}
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
                {viewMode !== 'nightly' ? (
                  // Period view: Show summary only
                  <div className="p-6 text-center">
                    <div className="mb-4">
                      <div className="text-3xl font-bold text-error mb-2">
                        {formatCurrency(report.summary.total_comps || 0)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Total Comps & Discounts
                      </div>
                      {report.summary.net_sales > 0 && (
                        <div className="mt-2 text-lg font-semibold text-error/80">
                          {((report.summary.total_comps / report.summary.net_sales) * 100).toFixed(1)}% of Net Sales
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground border-t pt-4">
                      Detailed comp data is only available in Nightly view
                    </div>
                  </div>
                ) : (report.discounts.length > 0 || report.detailedComps.length > 0) ? (
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
          {viewMode === 'nightly' ? (
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
          ) : (
            // Period view: VIP activity not available
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Star className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="font-semibold mb-2">VIP Activity</p>
                <p className="text-sm text-muted-foreground">
                  Guest-level data is only available in Nightly view
                </p>
              </CardContent>
            </Card>
          )}

          {/* Attestation Footer — Incidents, Coaching & Submit */}
          <AttestationFooter
            attestation={att.attestation}
            triggers={att.triggers}
            incidents={att.incidents}
            coachingActions={att.coachingActions}
            completionState={att.completionState}
            canSubmit={att.canSubmit}
            isLocked={att.isLocked}
            loading={att.loading}
            saving={att.saving}
            submitting={att.submitting}
            error={att.error}
            onAddIncident={att.addIncident}
            onAddCoaching={att.addCoaching}
            onSubmit={att.submitAttestation}
          />

          {/* Server Detail Modal */}
          <ServerDetailModal
            server={selectedServer}
            teamAverages={serverTeamAverages || {
              avg_covers: 0, avg_net_sales: 0, avg_ticket: 0,
              avg_turn_mins: 0, avg_per_cover: 0, avg_tip_pct: null, server_count: 0,
            }}
            date={date}
            venueName={selectedVenue?.name || ''}
            venueId={selectedVenue?.id || ''}
            periodLabel={serverPerfTab === 'nightly' ? 'Tonight' : serverPerfTab === 'wtd' ? 'Week to Date' : 'Period to Date'}
            isOpen={serverModalOpen}
            onClose={() => {
              setServerModalOpen(false);
              setSelectedServer(null);
            }}
          />

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
