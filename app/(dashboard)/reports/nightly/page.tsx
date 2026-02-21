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
  XCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  Activity,
  ArrowUpRight,
  ClipboardCheck,
  Lock,
  Minus,
  Receipt,
  CalendarCheck,
} from 'lucide-react';
import { useAttestation } from '@/components/attestation/useAttestation';
import { AttestationStepper } from '@/components/attestation/stepper/AttestationStepper';
import { ServerDetailModal } from '@/components/reports/ServerDetailModal';
import { PeriodWeekBreakdown } from '@/components/reports/PeriodWeekBreakdown';
import { YtdPeriodBreakdown } from '@/components/reports/YtdPeriodBreakdown';
import { PeriodGaugeCard, PeriodCategoryMixCard } from '@/components/pulse/PeriodGaugeCard';
import { LaborCard } from '@/components/pulse/LaborCard';
import { CompCard } from '@/components/pulse/CompCard';
import { CheckListSheet } from '@/components/pulse/CheckListSheet';
import { CheckDetailDialog } from '@/components/pulse/CheckDetailDialog';
import { ReservationListSheet } from '@/components/pulse/ReservationListSheet';
import type { NightlyReportPayload } from '@/lib/attestation/types';

// ---------------------------------------------------------------------------
// Category classification helpers (used for actual item-level net computation)
// ---------------------------------------------------------------------------
function isBevCategory(cat: string) {
  const lower = (cat || '').toLowerCase();
  return lower.includes('bev') || lower.includes('wine') ||
         lower.includes('beer') || lower.includes('liquor') ||
         lower.includes('cocktail') || lower.includes('spirit') ||
         lower.includes('draft') || lower.includes('drink');
}

function isFoodCategory(cat: string) {
  const lower = (cat || '').toLowerCase();
  return lower.includes('food') || lower.includes('entree') ||
         lower.includes('appetizer') || lower.includes('dessert') ||
         lower.includes('salad') || lower.includes('soup') ||
         lower.includes('side') || lower === '';
}

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
  // Core summary from venue_day_facts (Supabase — fast, authoritative)
  net_sales?: number;
  gross_sales?: number;
  total_checks?: number;
  total_covers?: number;
  total_comps?: number;
  total_voids?: number;
  tips_total?: number;
  avg_check?: number;
  avg_cover?: number;
  // Category sales
  food_sales?: number;
  beverage_sales?: number;
  wine_sales?: number;
  liquor_sales?: number;
  beer_sales?: number;
  beverage_pct?: number;
  // Nightly category breakdown from category_day_facts
  salesByCategory?: Array<{
    category: string;
    gross_sales: number;
    comps: number;
    voids: number;
    net_sales: number;
    quantity: number;
  }>;
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
    // SWLY (Same Week Last Year)
    wtd_swly_net_sales: number | null;
    wtd_swly_covers: number | null;
    vs_wtd_swly_pct: number | null;
    vs_wtd_swly_covers_pct: number | null;
    // PTD vs SPLY (Same Period Last Year)
    ptd_sply_net_sales: number | null;
    ptd_sply_covers: number | null;
    vs_ptd_sply_pct: number | null;
    vs_ptd_sply_covers_pct: number | null;
    // YTD (Year-to-Date)
    ytd_net_sales: number | null;
    ytd_covers: number | null;
    ytd_ly_net_sales: number | null;
    ytd_ly_covers: number | null;
    vs_ytd_pct: number | null;
    vs_ytd_covers_pct: number | null;
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
  servers_ytd?: Array<{
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
  // YTD aggregations
  categories_ytd?: Array<{
    category: string;
    gross_sales: number;
    comps: number;
    voids: number;
    net_sales: number;
    quantity: number;
  }>;
  items_ytd?: Array<{
    name: string;
    qty: number;
    net_total: number;
    category: string;
  }>;
  labor_ytd?: {
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
  // Period breakdowns
  ptd_weeks?: Array<{
    week: number;
    label: string;
    start_date: string;
    end_date: string;
    net_sales: number;
    covers: number;
    prior_net_sales: number | null;
    prior_covers: number | null;
  }>;
  ytd_periods?: Array<{
    period: number;
    label: string;
    start_date: string;
    end_date: string;
    net_sales: number;
    covers: number;
    prior_net_sales: number | null;
    prior_covers: number | null;
  }>;
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
  const { selectedVenue, setSelectedVenue, isAllVenues } = useVenue();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Global view mode state (synchronized with URL)
  type ViewMode = 'nightly' | 'wtd' | 'ptd' | 'ytd';
  const [viewMode, setViewMode] = useState<ViewMode>(
    (searchParams.get('view') as ViewMode) || 'nightly'
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
  const [selectedServer, setSelectedServer] = useState<NightlyReportData['servers'][0] | null>(null);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [laborExceptions, setLaborExceptions] = useState<any | null>(null);
  const [loadingLaborExceptions, setLoadingLaborExceptions] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<VenueHealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(false);
  const [enrichment, setEnrichment] = useState<{ labor: any; comps: any } | null>(null);
  const [paceData, setPaceData] = useState<{
    current: any;
    sdlw: any;
    sdly: any;
    forecast: any;
    pace: any;
  } | null>(null);
  const [attestStepperOpen, setAttestStepperOpen] = useState(false);
  const [checksSheetOpen, setChecksSheetOpen] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [checkDetailOpen, setCheckDetailOpen] = useState(false);
  const [reservationsSheetOpen, setReservationsSheetOpen] = useState(false);

  // Group view state (when "All Venues" is selected)
  const [groupData, setGroupData] = useState<{
    venues: Array<{
      venue_id: string;
      venue_name: string;
      summary: { net_sales: number; covers_count: number; avg_check: number; avg_cover: number; beverage_pct: number; comps_total: number; food_sales: number; beverage_sales: number; gross_sales: number; checks_count: number };
      labor: { total_hours: number; labor_cost: number; labor_pct: number; splh: number; ot_hours: number } | null;
      forecast: { revenue_predicted: number | null; covers_predicted: number | null } | null;
      variance: { vs_sdlw_pct: number | null; vs_sdly_pct: number | null; vs_forecast_pct: number | null };
    }>;
    totals: any;
    fiscal: any;
  } | null>(null);

  // Handler for view mode changes (updates URL)
  function handleViewChange(newView: ViewMode) {
    setViewMode(newView);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', newView);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  // Helper: Get period start date for WTD/PTD/YTD
  function getPeriodStart(endDate: string, mode: 'wtd' | 'ptd' | 'ytd'): string {
    if (mode === 'wtd') {
      const dateObj = new Date(endDate + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(dateObj);
      monday.setDate(monday.getDate() - daysFromMonday);
      return monday.toISOString().split('T')[0];
    } else if (mode === 'ytd') {
      // YTD: Use FY start from fiscal info, fallback to Jan 1
      return factsSummary?.fiscal?.fy_start_date
        ? factsSummary.fiscal.fy_start_date
        : `${endDate.split('-')[0]}-01-01`;
    } else {
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
        : viewMode === 'ptd'
          ? factsSummary?.servers_ptd
          : factsSummary?.servers_ytd;
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

  // Core nightly metrics: prefer venue_day_facts (fast Supabase, same as Pulse)
  // over TipSee report (slow direct query, sometimes missing data)
  const nightlyNetSales = factsSummary?.net_sales ?? report?.summary?.net_sales ?? 0;
  const nightlyCovers = factsSummary?.total_covers ?? report?.summary?.total_covers ?? 0;
  const nightlyComps = factsSummary?.total_comps ?? report?.summary?.total_comps ?? 0;

  // Category net via proportional allocation:
  // Item-level price*qty doesn't sum to check-level revenue_total (packages,
  // minimums, pricing structures). Use item gross as distribution weights to
  // divide the authoritative check-level net_sales across food/bev/other.
  const actualCategoryNet = React.useMemo(() => {
    const categories = report?.salesByCategory || factsSummary?.salesByCategory || [];
    const netSales = nightlyNetSales;
    let grossFood = 0, grossBev = 0, grossOther = 0;
    for (const c of categories) {
      const gross = Number(c.gross_sales) || 0;
      if (isBevCategory(c.category)) grossBev += gross;
      else if (isFoodCategory(c.category)) grossFood += gross;
      else grossOther += gross;
    }
    const grossTotal = grossFood + grossBev + grossOther;
    const ratio = grossTotal > 0 && netSales > 0 ? netSales / grossTotal : 1;
    return {
      foodNet: Math.round(grossFood * ratio * 100) / 100,
      bevNet: Math.round(grossBev * ratio * 100) / 100,
      otherNet: Math.round(grossOther * ratio * 100) / 100,
    };
  }, [report?.salesByCategory, factsSummary?.salesByCategory, nightlyNetSales]);

  // Variance/forecast for attestation stepper: merge factsSummary with paceData,
  // filling in null fields from paceData (same source as hero section).
  const stepperVariance = React.useMemo(() => {
    const fv = factsSummary?.variance;
    const pct = (a: number, b: number | null) =>
      b && b > 0 ? ((a - b) / b) * 100 : null;
    const ns = nightlyNetSales;
    const cv = nightlyCovers;
    // Compute paceData-based fallbacks for sales
    const pSdlwPct = pct(ns, paceData?.sdlw?.net_sales ?? null);
    const pSdlyPct = pct(ns, paceData?.sdly?.net_sales ?? null);
    const pFcstPct = pct(ns, paceData?.forecast?.revenue_predicted ?? null);
    // Compute paceData-based fallbacks for covers
    const pSdlwCoversPct = pct(cv, paceData?.sdlw?.covers_count ?? null);
    const pSdlyCoversPct = pct(cv, paceData?.sdly?.covers_count ?? null);
    const pFcstCoversPct = pct(cv, paceData?.forecast?.covers_predicted ?? null);
    return {
      ...fv,
      vs_forecast_pct: fv?.vs_forecast_pct ?? pFcstPct,
      vs_sdlw_pct: fv?.vs_sdlw_pct ?? pSdlwPct,
      vs_sdly_pct: fv?.vs_sdly_pct ?? pSdlyPct,
      vs_forecast_covers_pct: fv?.vs_forecast_covers_pct ?? pFcstCoversPct,
      vs_sdlw_covers_pct: fv?.vs_sdlw_covers_pct ?? pSdlwCoversPct,
      vs_sdly_covers_pct: fv?.vs_sdly_covers_pct ?? pSdlyCoversPct,
    };
  }, [factsSummary?.variance, paceData, nightlyNetSales, nightlyCovers]);

  const stepperForecast = React.useMemo(() => {
    const ff = factsSummary?.forecast;
    const pf = paceData?.forecast;
    if (!ff && !pf) return null;
    return {
      net_sales: ff?.net_sales ?? pf?.revenue_predicted ?? null,
      covers: ff?.covers ?? pf?.covers_predicted ?? null,
      net_sales_lower: ff?.net_sales_lower ?? null,
      net_sales_upper: ff?.net_sales_upper ?? null,
      covers_lower: ff?.covers_lower ?? null,
      covers_upper: ff?.covers_upper ?? null,
    };
  }, [factsSummary?.forecast, paceData?.forecast]);

  // Build attestation report payload (memoised to avoid re-triggering hook)
  const attestationReportData: NightlyReportPayload | null = React.useMemo(() => {
    if ((!report && !factsSummary) || !selectedVenue?.id || !date) return null;

    // Forecast: prefer factsSummary, fallback to paceData
    const fcstSales = factsSummary?.forecast?.net_sales || paceData?.forecast?.revenue_predicted || 0;
    const fcstCovers = factsSummary?.forecast?.covers || paceData?.forecast?.covers_predicted || 0;

    // Bev mix %
    const bevNet = actualCategoryNet.bevNet;
    const catTotal = actualCategoryNet.foodNet + bevNet + actualCategoryNet.otherNet;
    const bevPct = catTotal > 0 ? (bevNet / catTotal) * 100 : undefined;

    return {
      venue_id: selectedVenue.id,
      business_date: date,
      net_sales: nightlyNetSales,
      forecasted_sales: fcstSales,
      total_comp_amount: nightlyComps,
      comp_count: report?.detailedComps?.length || 0,
      comps: (report?.detailedComps || []).map(c => ({
        check_id: c.check_id,
        check_amount: c.check_total,
        comp_amount: c.comp_total,
        comp_reason: c.reason,
        employee_name: c.server,
      })),
      covers: nightlyCovers,
      forecasted_covers: fcstCovers,
      sdlw_net_sales: paceData?.sdlw?.net_sales ?? undefined,
      sdly_net_sales: paceData?.sdly?.net_sales ?? undefined,
      sdlw_covers: paceData?.sdlw?.covers_count ?? undefined,
      sdly_covers: paceData?.sdly?.covers_count ?? undefined,
      beverage_pct: bevPct,
      actual_labor_cost: factsSummary?.labor?.labor_cost || 0,
      scheduled_labor_cost: 0,
      overtime_hours: factsSummary?.labor?.ot_hours || 0,
      walkout_count: 0,
    };
  }, [report, selectedVenue?.id, date, factsSummary, nightlyNetSales, nightlyCovers, nightlyComps, paceData, actualCategoryNet]);

  // Enriched factsSummary for attestation stepper — merges paceData comparisons
  // and enrichment labor so the stepper has the same data as the main page.
  const stepperFacts = React.useMemo(() => {
    if (!factsSummary && !paceData && !enrichment) return null;

    const pct = (a: number, b: number | null | undefined) =>
      b && b > 0 ? ((a - b) / b) * 100 : null;
    const ns = nightlyNetSales;
    const cv = nightlyCovers;
    const fv = factsSummary?.variance;

    return {
      ...factsSummary,
      labor: factsSummary?.labor ?? enrichment?.labor,
      forecast: factsSummary?.forecast ?? (paceData?.forecast ? {
        net_sales: paceData.forecast.revenue_predicted ?? null,
        covers: paceData.forecast.covers_predicted ?? null,
      } : null),
      variance: {
        ...fv,
        vs_forecast_pct: fv?.vs_forecast_pct ?? pct(ns, paceData?.forecast?.revenue_predicted),
        vs_sdlw_pct: fv?.vs_sdlw_pct ?? pct(ns, paceData?.sdlw?.net_sales),
        vs_sdly_pct: fv?.vs_sdly_pct ?? pct(ns, paceData?.sdly?.net_sales),
        vs_forecast_covers_pct: fv?.vs_forecast_covers_pct ?? pct(cv, paceData?.forecast?.covers_predicted),
        vs_sdlw_covers_pct: fv?.vs_sdlw_covers_pct ?? pct(cv, paceData?.sdlw?.covers_count),
        vs_sdly_covers_pct: fv?.vs_sdly_covers_pct ?? pct(cv, paceData?.sdly?.covers_count),
      },
    };
  }, [factsSummary, paceData, enrichment, nightlyNetSales, nightlyCovers]);

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

  // Fetch report when date or location changes
  useEffect(() => {
    async function fetchReport() {
      if (!selectedVenue?.id || !date) return;

      // Group view: aggregate facts across all venues
      if (isAllVenues) {
        setLoading(true);
        setError(null);
        setReport(null);
        setGroupData(null);
        setCompExceptions(null);
        setEnrichment(null);
        setPaceData(null);
        setHealthData(null);
        try {
          const res = await fetch(
            `/api/nightly/facts?date=${date}&venue_id=all&view=${viewMode}`,
            { credentials: 'include' }
          );
          if (!res.ok) throw new Error(`Facts API returned ${res.status}`);
          const data = await res.json();
          if (data.has_data) {
            setGroupData({ venues: data.venues, totals: data.totals, fiscal: data.fiscal });
            setFactsSummary({
              ...data.totals.summary,
              salesByCategory: data.totals.categories,
              labor: data.totals.labor,
              forecast: data.totals.forecast,
              variance: data.totals.variance,
              fiscal: data.fiscal,
              servers_wtd: data.servers_wtd,
              categories_wtd: data.categories_wtd,
              items_wtd: data.items_wtd,
              labor_wtd: data.labor_wtd,
              servers_ptd: data.servers_ptd,
              categories_ptd: data.categories_ptd,
              items_ptd: data.items_ptd,
              labor_ptd: data.labor_ptd,
              servers_ytd: data.servers_ytd,
              categories_ytd: data.categories_ytd,
              items_ytd: data.items_ytd,
              labor_ytd: data.labor_ytd,
              ptd_weeks: data.ptd_weeks,
              ytd_periods: data.ytd_periods,
            });
            setFactsError(null);
          } else {
            setGroupData(null);
            setFactsSummary(null);
            setError('No data available for this date');
          }
        } catch (err: any) {
          setError(err.message);
          setGroupData(null);
          setFactsSummary(null);
        } finally {
          setLoading(false);
        }
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
      setGroupData(null);
      setCompExceptions(null);
      setCompNotes({});

      // ---------------------------------------------------------------
      // PARALLEL: Fire ALL independent fetches at once.
      // Facts, labor exceptions, and health don't depend on TipSee data.
      // Only comp exceptions + AI review need the report first.
      // ---------------------------------------------------------------

      // 1) Non-blocking independents — fire immediately, don't await
      setLoadingFacts(true);
      setFactsError(null);
      const factsPromise = fetch(`/api/nightly/facts?date=${date}&venue_id=${selectedVenue.id}&view=${viewMode}`, { credentials: 'include' })
        .then(res => { if (!res.ok) throw new Error(`Facts API returned ${res.status}`); return res.json(); })
        .then(factsData => {
          if (factsData?.has_data) {
            setFactsSummary({
              ...factsData.summary,
              salesByCategory: factsData.salesByCategory,
              labor: factsData.labor,
              labor_sdlw: factsData.labor_sdlw,
              labor_sdly: factsData.labor_sdly,
              forecast: factsData.forecast,
              variance: factsData.variance,
              servers_wtd: factsData.servers_wtd,
              servers_ptd: factsData.servers_ptd,
              servers_ytd: factsData.servers_ytd,
              categories_wtd: factsData.categories_wtd,
              categories_ptd: factsData.categories_ptd,
              categories_ytd: factsData.categories_ytd,
              items_wtd: factsData.items_wtd,
              items_ptd: factsData.items_ptd,
              items_ytd: factsData.items_ytd,
              labor_wtd: factsData.labor_wtd,
              labor_ptd: factsData.labor_ptd,
              labor_ytd: factsData.labor_ytd,
              ptd_weeks: factsData.ptd_weeks,
              ytd_periods: factsData.ytd_periods,
              fiscal: factsData.fiscal,
            });
            setFactsError(null);
          } else {
            setFactsSummary(null);
            setFactsError('No fact data available for this date');
          }
        })
        .catch(err => { console.error('Facts fetch error:', err); setFactsError(err.message || 'Failed to load analytics data'); setFactsSummary(null); })
        .finally(() => setLoadingFacts(false));

      if (viewMode === 'nightly') {
        setLoadingLaborExceptions(true);
        fetch(`/api/labor/exceptions?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data?.success && data?.data?.has_data) { setLaborExceptions(data.data); } else { setLaborExceptions(null); } })
          .catch(err => { console.error('Labor exceptions fetch error:', err); setLaborExceptions(null); })
          .finally(() => setLoadingLaborExceptions(false));
      }

      setLoadingHealth(true);
      fetch(`/api/health?view=daily&date=${date}&venue_id=${selectedVenue.id}`, { credentials: 'include' })
        .then(res => { if (!res.ok) throw new Error(`Health API returned ${res.status}`); return res.json(); })
        .then(healthResponse => {
          if (healthResponse?.venues && healthResponse.venues.length > 0) {
            const venueHealth = healthResponse.venues[0];
            setHealthData({
              health_score: venueHealth.latest_score || 0,
              status: venueHealth.status || 'YELLOW',
              confidence: venueHealth.daily?.[0]?.confidence || 0,
              signal_count: venueHealth.daily?.[0]?.signal_count || 0,
              top_drivers: venueHealth.latest_drivers || null,
              open_actions: 0,
            });
          } else { setHealthData(null); }
        })
        .catch(err => { console.error('[nightly] Health fetch failed:', err); setHealthData(null); })
        .finally(() => setLoadingHealth(false));

      // Enrichment: labor + comps from the same source as Pulse
      setEnrichment(null);
      fetch(`/api/pulse/enrichment?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setEnrichment({ labor: data.labor, comps: data.comps }); })
        .catch(err => { console.error('[nightly] Enrichment fetch failed:', err); });

      // Sales Pace: same data source as Pulse gauge cards
      setPaceData(null);
      fetch(`/api/sales/pace?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setPaceData(data); })
        .catch(err => { console.error('[nightly] Pace fetch failed:', err); });

      // 2) Critical path — TipSee report + comp notes (blocks UI)
      // Timeout after 15s so the page isn't stuck if TipSee is slow
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      try {
        const [liveRes, notesRes] = await Promise.all([
          fetch(`/api/nightly?date=${date}&location=${locationUuid}`, { signal: controller.signal }),
          fetch(`/api/nightly/comp-notes?venue_id=${selectedVenue.id}&business_date=${date}`, { credentials: 'include', signal: controller.signal }),
        ]);
        clearTimeout(timeoutId);

        if (!liveRes.ok) {
          const errData = await liveRes.json();
          throw new Error(errData.error || 'Failed to fetch report');
        }
        const liveData = await liveRes.json();
        setReport(liveData);

        if (notesRes.ok) {
          const notesData = await notesRes.json();
          setCompNotes(notesData.notes || {});
        }

        // 3) Post-report: comp exceptions → AI review (needs report data)
        if (liveData) {
          fetch(`/api/nightly/comp-exceptions?venue_id=${selectedVenue.id}&date=${date}`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              const parsedExceptions = data?.success ? data.data : null;
              if (parsedExceptions) setCompExceptions(parsedExceptions);
            })
            .catch(err => console.error('Comp exceptions error:', err));
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.warn('[nightly] Report fetch timed out — using facts data');
        } else {
          setError(err.message);
          setReport(null);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [date, locationUuid, selectedVenue?.id, selectedVenue?.name, isAllVenues, mappings.length]);

  // Refetch facts when view mode changes (WTD/PTD need different aggregations)
  useEffect(() => {
    if (!selectedVenue?.id || !date) return;

    // Group view: refetch with new viewMode via the same group endpoint
    if (isAllVenues) {
      setLoadingFacts(true);
      setFactsError(null);
      fetch(`/api/nightly/facts?date=${date}&venue_id=all&view=${viewMode}`, { credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error(`Facts API returned ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data?.has_data) {
            setGroupData({ venues: data.venues, totals: data.totals, fiscal: data.fiscal });
            setFactsSummary({
              ...data.totals.summary,
              salesByCategory: data.totals.categories,
              labor: data.totals.labor,
              forecast: data.totals.forecast,
              variance: data.totals.variance,
              fiscal: data.fiscal,
              servers_wtd: data.servers_wtd, categories_wtd: data.categories_wtd,
              items_wtd: data.items_wtd, labor_wtd: data.labor_wtd,
              servers_ptd: data.servers_ptd, categories_ptd: data.categories_ptd,
              items_ptd: data.items_ptd, labor_ptd: data.labor_ptd,
              servers_ytd: data.servers_ytd, categories_ytd: data.categories_ytd,
              items_ytd: data.items_ytd, labor_ytd: data.labor_ytd,
              ptd_weeks: data.ptd_weeks, ytd_periods: data.ytd_periods,
            });
            setFactsError(null);
          } else {
            setFactsSummary(null);
            setGroupData(null);
          }
        })
        .catch(err => {
          console.error('Group facts fetch error:', err);
          setFactsError(err.message || 'Failed to load group data');
        })
        .finally(() => setLoadingFacts(false));
      return;
    }

    // Single venue: refetch facts with new viewMode
    if (!report) return;

    setLoadingFacts(true);
    setFactsError(null);
    fetch(`/api/nightly/facts?date=${date}&venue_id=${selectedVenue.id}&view=${viewMode}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`Facts API returned ${res.status}`);
        return res.json();
      })
      .then(factsData => {
        if (factsData?.has_data) {
          setFactsSummary({
            ...factsData.summary,
            salesByCategory: factsData.salesByCategory,
            labor: factsData.labor,
            labor_sdlw: factsData.labor_sdlw,
            labor_sdly: factsData.labor_sdly,
            forecast: factsData.forecast,
            variance: factsData.variance,
            servers_wtd: factsData.servers_wtd,
            servers_ptd: factsData.servers_ptd,
            servers_ytd: factsData.servers_ytd,
            categories_wtd: factsData.categories_wtd,
            categories_ptd: factsData.categories_ptd,
            categories_ytd: factsData.categories_ytd,
            items_wtd: factsData.items_wtd,
            items_ptd: factsData.items_ptd,
            items_ytd: factsData.items_ytd,
            labor_wtd: factsData.labor_wtd,
            labor_ptd: factsData.labor_ptd,
            labor_ytd: factsData.labor_ytd,
            ptd_weeks: factsData.ptd_weeks,
            ytd_periods: factsData.ytd_periods,
            fiscal: factsData.fiscal,
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
  }, [viewMode, selectedVenue?.id, date, report, isAllVenues]);

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

        <div className="flex flex-wrap items-center gap-3">
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
          <Tabs value={viewMode} onValueChange={(v) => handleViewChange(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="nightly">Nightly</TabsTrigger>
              <TabsTrigger value="wtd">WTD</TabsTrigger>
              <TabsTrigger value="ptd">PTD</TabsTrigger>
              <TabsTrigger value="ytd">YTD</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {selectedVenue && !isAllVenues && viewMode === 'nightly' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChecksSheetOpen(true)}
                >
                  <Receipt className="h-4 w-4 mr-1.5" />
                  Checks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReservationsSheetOpen(true)}
                >
                  <CalendarCheck className="h-4 w-4 mr-1.5" />
                  Reservations
                </Button>
              </>
            )}
            {selectedVenue && !isAllVenues && viewMode === 'nightly' && !loading && (
              att.attestation ? (
                <Button
                  variant={att.isLocked ? 'outline' : 'brass'}
                  size="sm"
                  onClick={() => setAttestStepperOpen(true)}
                >
                  <ClipboardCheck className="h-4 w-4 mr-1.5" />
                  {att.isLocked ? 'View Attestation' : 'Attest'}
                </Button>
              ) : att.loading ? (
                <Button variant="outline" size="sm" disabled>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Loading…
                </Button>
              ) : att.error ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300"
                  onClick={() => window.location.reload()}
                >
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                  Retry
                </Button>
              ) : null
            )}
          </div>
        </div>
      </div>

      {/* Quick Venue Switcher */}
      <VenueQuickSwitcher />

      {/* Period Date Range Banner */}
      {viewMode !== 'nightly' && factsSummary && (
        <Card className="p-4 mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {viewMode === 'wtd' ? 'Week to Date' : viewMode === 'ptd' ? 'Period to Date' : 'Year to Date'}:
            {' '}{formatDateDisplay(getPeriodStart(date, viewMode))} → {formatDateDisplay(date)}
            {viewMode === 'ptd' && factsSummary?.fiscal && (
              <span className="ml-2 text-blue-700 dark:text-blue-300">
                (P{factsSummary.fiscal.fiscal_period} FY{factsSummary.fiscal.fiscal_year})
              </span>
            )}
            {viewMode === 'ytd' && factsSummary?.fiscal && (
              <span className="ml-2 text-blue-700 dark:text-blue-300">
                (FY{factsSummary.fiscal.fiscal_year} · {factsSummary.fiscal.calendar_type})
              </span>
            )}
          </p>
        </Card>
      )}

      {/* Date Banner */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span className="font-medium">{formatDate(date)}</span>
      </div>

      {/* Loading skeleton — shows page structure instantly */}
      {loading && !report && !factsSummary && (
        <div className="space-y-4 animate-pulse">
          {/* Hero metrics skeleton */}
          <Card className="bg-muted/30 border-brass/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-4 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-16 rounded bg-muted" />
                    <div className="h-7 w-24 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          {/* Attestation banner skeleton */}
          <div className="h-14 rounded-md bg-muted/40 border border-brass/10" />
          {/* Labor card skeleton */}
          <Card>
            <CardHeader className="border-b border-brass/20 py-3">
              <div className="h-5 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-14 rounded bg-muted" />
                    <div className="h-6 w-20 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          {/* Server table skeleton */}
          <Card>
            <CardHeader className="border-b border-brass/20 py-3">
              <div className="h-5 w-36 rounded bg-muted" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="h-4 w-16 rounded bg-muted ml-auto" />
                    <div className="h-4 w-16 rounded bg-muted" />
                    <div className="h-4 w-16 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {loading && (report || factsSummary) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-brass" />
          Loading report details...
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

      {/* Report Content — renders when report OR facts are available */}
      {!error && (report || factsSummary) && (
        <>
          {/* Performance vs Benchmarks — Pulse-style gauge cards */}
          {(() => {
            // For nightly: use paceData (same source as Pulse — sales_snapshots)
            // For WTD/PTD/YTD: use factsSummary (venue_day_facts aggregations)
            const liveNetSales = viewMode === 'nightly'
              ? (paceData?.current?.net_sales ?? nightlyNetSales)
              : viewMode === 'wtd'
                ? (factsSummary?.variance?.wtd_net_sales || 0)
                : viewMode === 'ptd'
                  ? (factsSummary?.variance?.ptd_net_sales || 0)
                  : (factsSummary?.variance?.ytd_net_sales || 0);
            const liveCovers = viewMode === 'nightly'
              ? (paceData?.current?.covers_count ?? nightlyCovers)
              : viewMode === 'wtd'
                ? (factsSummary?.variance?.wtd_covers || 0)
                : viewMode === 'ptd'
                  ? (factsSummary?.variance?.ptd_covers || 0)
                  : (factsSummary?.variance?.ytd_covers || 0);
            const liveAvgCheck = viewMode === 'nightly' && paceData?.current?.avg_check
              ? paceData.current.avg_check
              : (liveCovers > 0 ? liveNetSales / liveCovers : 0);

            // Mode-appropriate variance labels and values
            let primaryLabel: string;
            let primarySalesPct: number | null = null;
            let primaryCoversPct: number | null = null;
            let primarySalesValue: number = 0;
            let primaryCoversValue: number = 0;
            let secondaryLabel: string | null = null;
            let secondarySalesPct: number | null = null;
            let secondaryCoversPct: number | null = null;
            let secondarySalesValue: number = 0;
            let secondaryCoversValue: number = 0;

            if (viewMode === 'nightly') {
              // Use paceData (same source as Pulse), factsSummary as fallback
              const sdlw = paceData?.sdlw;
              const sdly = paceData?.sdly;

              // SDLW comparison
              const sdlwSales = sdlw?.net_sales ?? factsSummary?.variance?.sdlw_net_sales ?? 0;
              const sdlwCovers = sdlw?.covers_count ?? factsSummary?.variance?.sdlw_covers ?? 0;
              const sdlwSalesPct = factsSummary?.variance?.vs_sdlw_pct
                ?? (sdlwSales > 0 ? ((liveNetSales - sdlwSales) / sdlwSales) * 100 : null);
              const sdlwCoversPct = factsSummary?.variance?.vs_sdlw_covers_pct
                ?? (sdlwCovers > 0 ? ((liveCovers - sdlwCovers) / sdlwCovers) * 100 : null);

              // SDLY comparison
              const sdlySales = sdly?.net_sales ?? factsSummary?.variance?.sdly_net_sales ?? 0;
              const sdlyCovers = sdly?.covers_count ?? factsSummary?.variance?.sdly_covers ?? 0;
              const sdlySalesPct = factsSummary?.variance?.vs_sdly_pct
                ?? (sdlySales > 0 ? ((liveNetSales - sdlySales) / sdlySales) * 100 : null);
              const sdlyCoversPct = factsSummary?.variance?.vs_sdly_covers_pct
                ?? (sdlyCovers > 0 ? ((liveCovers - sdlyCovers) / sdlyCovers) * 100 : null);

              // Forecast comparison
              const forecastSales = paceData?.forecast?.revenue_predicted ?? factsSummary?.forecast?.net_sales ?? null;
              const forecastCovers = paceData?.forecast?.covers_predicted ?? factsSummary?.forecast?.covers ?? null;
              const forecastSalesPct = factsSummary?.variance?.vs_forecast_pct
                ?? (forecastSales && forecastSales > 0 ? ((liveNetSales - forecastSales) / forecastSales) * 100 : null);
              const forecastCoversPct = factsSummary?.variance?.vs_forecast_covers_pct
                ?? (forecastCovers && forecastCovers > 0 ? ((liveCovers - forecastCovers) / forecastCovers) * 100 : null);

              // Primary: forecast if available, else SDLW
              if (forecastSales && forecastSales > 0) {
                primaryLabel = 'vs Forecast';
                primarySalesValue = forecastSales;
                primaryCoversValue = forecastCovers || 0;
                primarySalesPct = forecastSalesPct ?? null;
                primaryCoversPct = forecastCoversPct ?? null;
                secondaryLabel = 'vs SDLW';
                secondarySalesValue = sdlwSales;
                secondaryCoversValue = sdlwCovers;
                secondarySalesPct = sdlwSalesPct ?? null;
                secondaryCoversPct = sdlwCoversPct ?? null;
              } else {
                primaryLabel = 'vs SDLW';
                primarySalesValue = sdlwSales;
                primaryCoversValue = sdlwCovers;
                primarySalesPct = sdlwSalesPct ?? null;
                primaryCoversPct = sdlwCoversPct ?? null;
                secondaryLabel = 'vs SDLY';
                secondarySalesValue = sdlySales;
                secondaryCoversValue = sdlyCovers;
                secondarySalesPct = sdlySalesPct ?? null;
                secondaryCoversPct = sdlyCoversPct ?? null;
              }
            } else if (viewMode === 'wtd') {
              primaryLabel = 'vs LW';
              primarySalesPct = factsSummary?.variance?.vs_wtd_pct ?? null;
              primaryCoversPct = factsSummary?.variance?.vs_wtd_covers_pct ?? null;
              primarySalesValue = factsSummary?.variance?.wtd_lw_net_sales || 0;
              primaryCoversValue = factsSummary?.variance?.wtd_lw_covers || 0;
              secondaryLabel = 'vs SWLY';
              secondarySalesPct = factsSummary?.variance?.vs_wtd_swly_pct ?? null;
              secondaryCoversPct = factsSummary?.variance?.vs_wtd_swly_covers_pct ?? null;
              secondarySalesValue = factsSummary?.variance?.wtd_swly_net_sales || 0;
              secondaryCoversValue = factsSummary?.variance?.wtd_swly_covers || 0;
            } else if (viewMode === 'ptd') {
              primaryLabel = 'vs LP';
              primarySalesPct = factsSummary?.variance?.vs_ptd_pct ?? null;
              primaryCoversPct = factsSummary?.variance?.vs_ptd_covers_pct ?? null;
              primarySalesValue = factsSummary?.variance?.ptd_lw_net_sales || 0;
              primaryCoversValue = factsSummary?.variance?.ptd_lw_covers || 0;
              secondaryLabel = 'vs SPLY';
              secondarySalesPct = factsSummary?.variance?.vs_ptd_sply_pct ?? null;
              secondaryCoversPct = factsSummary?.variance?.vs_ptd_sply_covers_pct ?? null;
              secondarySalesValue = factsSummary?.variance?.ptd_sply_net_sales || 0;
              secondaryCoversValue = factsSummary?.variance?.ptd_sply_covers || 0;
            } else {
              primaryLabel = 'vs LY';
              primarySalesPct = factsSummary?.variance?.vs_ytd_pct ?? null;
              primaryCoversPct = factsSummary?.variance?.vs_ytd_covers_pct ?? null;
              primarySalesValue = factsSummary?.variance?.ytd_ly_net_sales || 0;
              primaryCoversValue = factsSummary?.variance?.ytd_ly_covers || 0;
            }

            // Avg check for prior periods
            const primaryAvgCheck = primaryCoversValue > 0 ? primarySalesValue / primaryCoversValue : 0;
            const secondaryAvgCheck = secondaryCoversValue > 0 ? secondarySalesValue / secondaryCoversValue : 0;
            const avgCheckPrimaryPct = primaryAvgCheck > 0 ? ((liveAvgCheck - primaryAvgCheck) / primaryAvgCheck) * 100 : null;
            const avgCheckSecondaryPct = secondaryAvgCheck > 0 ? ((liveAvgCheck - secondaryAvgCheck) / secondaryAvgCheck) * 100 : null;

            // Category mix: proportional allocation of check-level net_sales
            // using item-level gross as distribution weights.
            // Item prices don't sum to check revenue (packages, minimums).
            // For nightly: use pre-computed actualCategoryNet (lifted useMemo)
            // For WTD/PTD/YTD: category_day_facts already has proportional net_sales
            let foodNet: number, bevNet: number, otherNet: number;
            if (viewMode === 'nightly') {
              foodNet = actualCategoryNet.foodNet;
              bevNet = actualCategoryNet.bevNet;
              otherNet = actualCategoryNet.otherNet;
            } else {
              const categories: Array<{ category: string; net_sales: number }> =
                viewMode === 'wtd'
                  ? (factsSummary?.categories_wtd || [])
                  : viewMode === 'ptd'
                    ? (factsSummary?.categories_ptd || [])
                    : (factsSummary?.categories_ytd || []);
              foodNet = 0; bevNet = 0; otherNet = 0;
              for (const c of categories) {
                const net = Number(c.net_sales) || 0;
                if (isBevCategory(c.category)) bevNet += net;
                else if (isFoodCategory(c.category)) foodNet += net;
                else otherNet += net;
              }
            }

            // Prior bev mix from SDLW
            let priorBevPct: number | null = null;
            if (viewMode === 'nightly' && paceData?.sdlw) {
              const sdlwTotal = (paceData.sdlw.food_sales ?? 0) + (paceData.sdlw.beverage_sales ?? 0);
              if (sdlwTotal > 0) {
                priorBevPct = ((paceData.sdlw.beverage_sales ?? 0) / sdlwTotal) * 100;
              }
            }

            // Labor data: enrichment (same source as Pulse) for nightly,
            // factsSummary for period views
            const laborData = viewMode === 'nightly'
              ? (enrichment?.labor ?? factsSummary?.labor)
              : viewMode === 'wtd'
                ? factsSummary?.labor_wtd
                : viewMode === 'ptd'
                  ? factsSummary?.labor_ptd
                  : factsSummary?.labor_ytd;

            // Comp data: enrichment (same source as Pulse) for nightly
            const compCardData = viewMode === 'nightly'
              ? (enrichment?.comps ?? null)
              : null;

            return (
              <>
                {/* Header with Health Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-brass" />
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Performance vs Benchmarks
                    </span>
                  </div>
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

                {/* Hero gauge cards — mirrors Live Pulse layout */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <PeriodGaugeCard
                    title="Net Revenue"
                    icon={DollarSign}
                    current={liveNetSales}
                    prior={primarySalesValue}
                    variancePct={primarySalesPct}
                    priorLabel={primaryLabel}
                    secondaryPrior={secondarySalesValue || null}
                    secondaryVariancePct={secondarySalesPct}
                    secondaryLabel={secondaryLabel}
                  />
                  <PeriodGaugeCard
                    title="Covers"
                    icon={Users}
                    current={liveCovers}
                    prior={primaryCoversValue}
                    variancePct={primaryCoversPct}
                    priorLabel={primaryLabel}
                    secondaryPrior={secondaryCoversValue || null}
                    secondaryVariancePct={secondaryCoversPct}
                    secondaryLabel={secondaryLabel}
                    format="number"
                  />
                  <PeriodGaugeCard
                    title="Avg Check"
                    icon={TrendingUp}
                    current={Math.round(liveAvgCheck)}
                    prior={Math.round(primaryAvgCheck)}
                    variancePct={avgCheckPrimaryPct != null ? Math.round(avgCheckPrimaryPct * 10) / 10 : null}
                    priorLabel={primaryLabel}
                    secondaryPrior={secondaryAvgCheck > 0 ? Math.round(secondaryAvgCheck) : null}
                    secondaryVariancePct={avgCheckSecondaryPct != null ? Math.round(avgCheckSecondaryPct * 10) / 10 : null}
                    secondaryLabel={secondaryLabel}
                  />
                  <PeriodCategoryMixCard
                    foodSales={foodNet}
                    bevSales={bevNet}
                    otherSales={otherNet}
                    priorBevPct={priorBevPct}
                  />
                </div>

                {/* Labor + Comps — only render when data exists */}
                {(laborData || compCardData) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {laborData && (
                      <LaborCard
                        labor={{ punch_count: 0, ...laborData }}
                        netSales={liveNetSales + (viewMode === 'nightly' ? nightlyComps : 0)}
                      />
                    )}
                    {compCardData && (
                      <CompCard comps={compCardData} />
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {/* PTD Week Breakdown */}
          {viewMode === 'ptd' && factsSummary?.ptd_weeks && factsSummary.ptd_weeks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Period Week Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <PeriodWeekBreakdown weeks={factsSummary.ptd_weeks} />
              </CardContent>
            </Card>
          )}

          {/* YTD Period Breakdown */}
          {viewMode === 'ytd' && factsSummary?.ytd_periods && factsSummary.ytd_periods.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Year-to-Date Period Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <YtdPeriodBreakdown periods={factsSummary.ytd_periods} />
              </CardContent>
            </Card>
          )}

          {/* Labor & Productivity */}
          {(() => {
            // Select labor data based on view mode
            const labor = viewMode === 'nightly'
              ? factsSummary?.labor
              : viewMode === 'wtd'
                ? factsSummary?.labor_wtd
                : viewMode === 'ptd'
                  ? factsSummary?.labor_ptd
                  : factsSummary?.labor_ytd;

            if (!labor) return null;

            const otPct = labor.total_hours > 0 ? (labor.ot_hours / labor.total_hours) * 100 : 0;
            const avgRate = labor.total_hours > 0 ? labor.labor_cost / labor.total_hours : 0;
            const otCost = labor.ot_hours * avgRate * 1.5;

            // Use period-appropriate covers for cost per cover and CPLH calculation
            const periodCovers = viewMode === 'nightly'
              ? nightlyCovers
              : viewMode === 'wtd'
                ? (factsSummary?.variance?.wtd_covers || 0)
                : viewMode === 'ptd'
                  ? (factsSummary?.variance?.ptd_covers || 0)
                  : (factsSummary?.variance?.ytd_covers || 0);
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
                      ? nightlyNetSales
                      : viewMode === 'wtd'
                        ? (factsSummary?.variance?.wtd_net_sales || 0)
                        : viewMode === 'ptd'
                          ? (factsSummary?.variance?.ptd_net_sales || 0)
                          : (factsSummary?.variance?.ytd_net_sales || 0);
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

          {/* Group Venue Breakdown Table */}
          {isAllVenues && groupData && groupData.venues.length > 0 && (
            <Card>
              <CardHeader className="border-b border-brass/20 py-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-brass" />
                  Venue Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">Venue</th>
                      <th className="text-right px-3 py-2.5 font-medium">Net Sales</th>
                      <th className="text-right px-3 py-2.5 font-medium">Covers</th>
                      <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">Avg Check</th>
                      <th className="text-right px-3 py-2.5 font-medium hidden lg:table-cell">Bev %</th>
                      <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">Comps</th>
                      <th className="text-right px-3 py-2.5 font-medium hidden lg:table-cell">Labor %</th>
                      <th className="text-right px-3 py-2.5 font-medium">vs SDLW</th>
                      <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">vs Fcst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupData.venues.map((v) => (
                      <tr
                        key={v.venue_id}
                        className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          const venue = { id: v.venue_id, name: v.venue_name };
                          setSelectedVenue(venue);
                        }}
                      >
                        <td className="px-4 py-2.5 font-medium">{v.venue_name}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums">${(v.summary.net_sales || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums">{v.summary.covers_count || 0}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums hidden md:table-cell">${(v.summary.avg_cover || v.summary.avg_check || 0).toFixed(2)}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums hidden lg:table-cell">{(v.summary.beverage_pct || 0).toFixed(1)}%</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-error hidden md:table-cell">${(v.summary.comps_total || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums hidden lg:table-cell">{v.labor ? `${v.labor.labor_pct.toFixed(1)}%` : '—'}</td>
                        <td className="text-right px-3 py-2.5">
                          {v.variance.vs_sdlw_pct != null ? (
                            <span className={v.variance.vs_sdlw_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {v.variance.vs_sdlw_pct >= 0 ? '+' : ''}{v.variance.vs_sdlw_pct.toFixed(1)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right px-3 py-2.5 hidden md:table-cell">
                          {v.variance.vs_forecast_pct != null ? (
                            <span className={v.variance.vs_forecast_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {v.variance.vs_forecast_pct >= 0 ? '+' : ''}{v.variance.vs_forecast_pct.toFixed(1)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                    {/* Group Totals Row */}
                    <tr className="font-bold border-t-2 border-brass/30 bg-muted/30">
                      <td className="px-4 py-2.5">Group Total</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">${(groupData.totals.summary.net_sales || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{groupData.totals.summary.total_covers || 0}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums hidden md:table-cell">${(groupData.totals.summary.avg_cover || groupData.totals.summary.avg_check || 0).toFixed(2)}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums hidden lg:table-cell">{(groupData.totals.summary.beverage_pct || 0).toFixed(1)}%</td>
                      <td className="text-right px-3 py-2.5 tabular-nums text-error hidden md:table-cell">${(groupData.totals.summary.total_comps || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums hidden lg:table-cell">{groupData.totals.labor ? `${groupData.totals.labor.labor_pct.toFixed(1)}%` : '—'}</td>
                      <td className="text-right px-3 py-2.5">
                        {groupData.totals.variance.vs_sdlw_pct != null ? (
                          <span className={groupData.totals.variance.vs_sdlw_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                            {groupData.totals.variance.vs_sdlw_pct >= 0 ? '+' : ''}{groupData.totals.variance.vs_sdlw_pct.toFixed(1)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right px-3 py-2.5 hidden md:table-cell">
                        {groupData.totals.variance.vs_forecast_pct != null ? (
                          <span className={groupData.totals.variance.vs_forecast_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                            {groupData.totals.variance.vs_forecast_pct >= 0 ? '+' : ''}{groupData.totals.variance.vs_forecast_pct.toFixed(1)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Main Content Grid — single venue only */}
          {!isAllVenues && (
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

                  // Nightly view: show loading while TipSee report is still fetching
                  if (viewMode === 'nightly' && !report && loading) {
                    return (
                      <div className="empty-state py-8 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-brass" />
                        <p className="text-muted-foreground">Loading server data...</p>
                      </div>
                    );
                  }

                  const serverData = viewMode === 'nightly'
                    ? (report?.servers || [])
                    : viewMode === 'wtd'
                      ? factsSummary?.servers_wtd || []
                      : viewMode === 'ptd'
                        ? factsSummary?.servers_ptd || []
                        : factsSummary?.servers_ytd || [];
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
                  // Nightly view: show loading while TipSee report is still fetching
                  if (viewMode === 'nightly' && !report && loading) {
                    return (
                      <div className="empty-state py-8 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-brass" />
                        <p className="text-muted-foreground">Loading menu items...</p>
                      </div>
                    );
                  }

                  // Select data source based on view mode
                  const menuItems = viewMode === 'nightly'
                    ? (report?.menuItems || [])
                    : viewMode === 'wtd'
                      ? (factsSummary?.items_wtd || [])
                      : viewMode === 'ptd'
                        ? (factsSummary?.items_ptd || [])
                        : (factsSummary?.items_ytd || []);

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

                  const isFood = (cat: string) => {
                    const lower = cat.toLowerCase();
                    return lower.includes('food') || lower.includes('appetizer') ||
                           lower.includes('entree') || lower.includes('dessert') ||
                           lower.includes('salad') || lower.includes('soup') ||
                           lower.includes('side') || lower.includes('brunch') ||
                           lower.includes('lunch') || lower.includes('dinner') ||
                           lower.includes('starter') || lower.includes('snack') ||
                           lower.includes('raw bar') || lower.includes('sushi');
                  };

                  const classifyItem = (item: any): 'Food' | 'Beverage' | 'Other' => {
                    // Use item_type from SQL if available (TipSee live data)
                    if (item.item_type) return item.item_type;
                    const category = item.parent_category || item.category || '';
                    if (isBeverage(category)) return 'Beverage';
                    if (isFood(category)) return 'Food';
                    return 'Other';
                  };

                  // Split into three buckets, top 5 each
                  const foodItems = menuItems.filter(i => classifyItem(i) === 'Food').slice(0, 5);
                  const bevItems = menuItems.filter(i => classifyItem(i) === 'Beverage').slice(0, 5);
                  const otherItems = menuItems.filter(i => classifyItem(i) === 'Other').slice(0, 5);

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
                          {otherItems.length > 0 && (
                            <>
                              <tr className="bg-muted/50">
                                <td colSpan={3} className="text-xs uppercase tracking-wide text-muted-foreground font-semibold py-2">
                                  Other
                                </td>
                              </tr>
                              {otherItems.map((item, i) => (
                                <tr key={`other-${i}`}>
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
                  {nightlyComps > 0 && (
                    <span className="ml-auto text-sm font-normal text-error">
                      {formatCurrency(nightlyComps)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {viewMode === 'nightly' && !report && loading ? (
                  // Nightly view: show loading while TipSee report is still fetching
                  <div className="empty-state py-8 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-brass" />
                    <p className="text-muted-foreground">Loading comp details...</p>
                  </div>
                ) : viewMode !== 'nightly' ? (
                  // Period view: Show summary only
                  <div className="p-6 text-center">
                    <div className="mb-4">
                      <div className="text-3xl font-bold text-error mb-2">
                        {formatCurrency(nightlyComps)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Total Comps & Discounts
                      </div>
                      {nightlyNetSales > 0 && (
                        <div className="mt-2 text-lg font-semibold text-error/80">
                          {((nightlyComps / nightlyNetSales) * 100).toFixed(1)}% of Net Sales
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground border-t pt-4">
                      Detailed comp data is only available in Nightly view
                    </div>
                  </div>
                ) : ((report?.discounts?.length ?? 0) > 0 || (report?.detailedComps?.length ?? 0) > 0) ? (
                  <Tabs defaultValue="by-reason" className="w-full">
                    <div className="px-4 pt-3">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="by-reason">By Reason</TabsTrigger>
                        <TabsTrigger value="all-comps">All Comps ({report?.detailedComps?.length})</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="by-reason" className="mt-0">
                      {(report?.discounts?.length ?? 0) > 0 ? (
                        (() => {
                          const totalComps = report?.discounts?.reduce((sum, d) => sum + (d.amount || 0), 0) ?? 0;
                          const compPct = nightlyNetSales > 0
                            ? ((totalComps / nightlyNetSales) * 100).toFixed(1)
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
                                  {report?.discounts?.map((disc, i) => {
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
                      {(report?.detailedComps?.length ?? 0) > 0 ? (
                        <div className="divide-y divide-border">
                          {report?.detailedComps?.map((comp, i) => (
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
          )}

          {/* VIP Activity — single venue only */}
          {!isAllVenues && (
          viewMode === 'nightly' ? (
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-brass" />
                  VIP Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!report && loading ? (
                  <div className="empty-state py-8 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-brass" />
                    <p className="text-muted-foreground">Loading VIP data...</p>
                  </div>
                ) : ((report?.notableGuests?.length ?? 0) > 0 || (report?.peopleWeKnow?.length ?? 0) > 0) ? (
                <Tabs defaultValue="top-spenders" className="w-full">
                  <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                    <TabsTrigger
                      value="top-spenders"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-brass data-[state=active]:bg-transparent"
                    >
                      Top Spenders ({report?.notableGuests?.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="vips"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-brass data-[state=active]:bg-transparent"
                    >
                      VIPs ({report?.peopleWeKnow?.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="top-spenders" className="mt-0">
                    {(report?.notableGuests?.length ?? 0) > 0 ? (
                      <div className="divide-y divide-border">
                        {report?.notableGuests?.map((guest, i) => (
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
                    {(report?.peopleWeKnow?.length ?? 0) > 0 ? (
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
                          {report?.peopleWeKnow?.map((person, i) => (
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
          ))}

          {/* Inline Attestation Status Banner — single venue only */}
          {!isAllVenues && att.attestation && (
            <Card
              className={`cursor-pointer transition-colors ${
                att.isLocked
                  ? 'border-sage/40 bg-sage/5 hover:bg-sage/10'
                  : 'border-brass/30 bg-brass/[0.02] hover:bg-brass/5'
              }`}
              onClick={() => setAttestStepperOpen(true)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {att.isLocked ? (
                    <Lock className="h-5 w-5 text-sage shrink-0" />
                  ) : (
                    <ClipboardCheck className="h-5 w-5 text-brass shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {att.isLocked
                        ? `Attestation ${att.attestation.status === 'amended' ? 'Amended' : 'Submitted'}`
                        : 'Nightly Attestation'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {att.isLocked && att.attestation.submitted_at
                        ? new Date(att.attestation.submitted_at).toLocaleString()
                        : (() => {
                            const required = Object.entries(att.completionState).filter(
                              ([, v]) => v !== 'not_required' && v !== 'always_optional',
                            );
                            const done = required.filter(([, v]) => v === 'complete').length;
                            return required.length > 0
                              ? `${done} of ${required.length} required module${required.length !== 1 ? 's' : ''} complete`
                              : 'No modules required — submit when ready';
                          })()}
                    </div>
                  </div>
                  {/* Module status chips */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {Object.entries(att.completionState).map(([key, status]) => {
                      if (status === 'not_required') return null;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-background border text-[10px]"
                        >
                          {status === 'complete' ? (
                            <CheckCircle2 className="h-3 w-3 text-sage" />
                          ) : status === 'always_optional' ? (
                            <Minus className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <XCircle className="h-3 w-3 text-error" />
                          )}
                          <span className="capitalize">{key}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant={att.isLocked ? 'outline' : 'brass'}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttestStepperOpen(true);
                    }}
                  >
                    {att.isLocked ? 'View' : 'Begin'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Server Detail Modal — single venue only */}
          {!isAllVenues && <ServerDetailModal
            server={selectedServer}
            teamAverages={serverTeamAverages || {
              avg_covers: 0, avg_net_sales: 0, avg_ticket: 0,
              avg_turn_mins: 0, avg_per_cover: 0, avg_tip_pct: null, server_count: 0,
            }}
            date={date}
            venueName={selectedVenue?.name || ''}
            venueId={selectedVenue?.id || ''}
            periodLabel={viewMode === 'nightly' ? 'Tonight' : viewMode === 'wtd' ? 'Week to Date' : viewMode === 'ptd' ? 'Period to Date' : 'Year to Date'}
            isOpen={serverModalOpen}
            onClose={() => {
              setServerModalOpen(false);
              setSelectedServer(null);
            }}
          />}

          {/* Attestation Stepper Modal — single venue only */}
          {!isAllVenues && <AttestationStepper
            open={attestStepperOpen}
            onClose={() => setAttestStepperOpen(false)}
            venueId={selectedVenue?.id}
            reportSummary={report ? report.summary : null}
            factsSummary={stepperFacts}
            compExceptions={compExceptions}
            compReview={null}
            laborExceptions={laborExceptions}
            healthData={healthData}
            attestation={att.attestation}
            triggers={att.triggers}
            compResolutions={att.compResolutions}
            incidents={att.incidents}
            coachingActions={att.coachingActions}
            completionState={att.completionState}
            canSubmit={att.canSubmit}
            isLocked={att.isLocked}
            loading={att.loading}
            saving={att.saving}
            submitting={att.submitting}
            error={att.error}
            updateField={att.updateField}
            addCompResolution={att.addCompResolution}
            addIncident={att.addIncident}
            addCoaching={att.addCoaching}
            submitAttestation={att.submitAttestation}
            date={date}
            venueName={selectedVenue?.name || ''}
            notableGuests={report?.notableGuests ?? []}
            peopleWeKnow={report?.peopleWeKnow ?? []}
            compsByReason={report?.discounts ?? []}
            topItems={(report?.menuItems ?? []).slice(0, 10).map(i => ({
              name: i.name,
              revenue: i.net_total,
              quantity: i.qty,
            }))}
            serverPerformance={(report?.servers ?? []).map(s => ({
              name: s.employee_name,
              net_sales: s.net_sales,
              covers: s.covers,
              checks: s.tickets,
              avg_check: s.avg_ticket,
              tip_pct: s.tip_pct ?? 0,
            }))}
            discountsTotal={report?.discounts?.reduce((sum, d) => sum + (d.amount || 0), 0) ?? 0}
          />}

          {/* Check & Reservation Sheets */}
          {selectedVenue && !isAllVenues && (
            <>
              <CheckListSheet
                isOpen={checksSheetOpen}
                onClose={() => setChecksSheetOpen(false)}
                venueId={selectedVenue.id}
                venueName={selectedVenue.name}
                date={date}
                onSelectCheck={(id) => {
                  setSelectedCheckId(id);
                  setCheckDetailOpen(true);
                }}
              />
              <CheckDetailDialog
                checkId={selectedCheckId}
                isOpen={checkDetailOpen}
                onClose={() => {
                  setCheckDetailOpen(false);
                  setSelectedCheckId(null);
                }}
              />
              <ReservationListSheet
                isOpen={reservationsSheetOpen}
                onClose={() => setReservationsSheetOpen(false)}
                venueId={selectedVenue.id}
                venueName={selectedVenue.name}
                date={date}
              />
            </>
          )}

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
