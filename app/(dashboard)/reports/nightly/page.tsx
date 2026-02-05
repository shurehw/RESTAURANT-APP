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
    net_sales: number;
    comps: number;
    voids: number;
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
    // PTD (Period-to-Date)
    ptd_net_sales: number | null;
    ptd_covers: number | null;
    ptd_lw_net_sales: number | null;
    ptd_lw_covers: number | null;
    vs_ptd_pct: number | null;
    vs_ptd_covers_pct: number | null;
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
  const [date, setDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [report, setReport] = useState<NightlyReportData | null>(null);
  const [factsSummary, setFactsSummary] = useState<FactsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<VenueMapping[]>([]);
  const [compNotes, setCompNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

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
      if (!selectedVenue?.id) return;

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
      try {
        // Fetch live TipSee data and fact tables in parallel
        const [liveRes, factsRes] = await Promise.all([
          fetch(`/api/nightly?date=${date}&location=${locationUuid}`),
          fetch(`/api/nightly/facts?date=${date}&venue_id=${selectedVenue.id}`),
        ]);

        if (!liveRes.ok) {
          const errData = await liveRes.json();
          throw new Error(errData.error || 'Failed to fetch report');
        }
        const liveData = await liveRes.json();
        setReport(liveData);

        // Get food/bev breakdown, labor, forecast, and variance from fact tables
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

        // Fetch comp notes
        try {
          const notesRes = await fetch(
            `/api/nightly/comp-notes?venue_id=${selectedVenue.id}&business_date=${date}`
          );
          if (notesRes.ok) {
            const notesData = await notesRes.json();
            setCompNotes(notesData.notes || {});
          }
        } catch (e) {
          console.error('Failed to fetch comp notes:', e);
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
                  {/* Net Sales with variance */}
                  <div className="space-y-1">
                    <div className="text-2xl font-bold tabular-nums">
                      {formatCurrency(report.summary.net_sales || 0)}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase">Net Sales</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <VarianceBadge value={factsSummary.variance.vs_forecast_pct} label="Fcst" />
                      <VarianceBadge value={factsSummary.variance.vs_sdlw_pct} label="SDLW" />
                      <VarianceBadge value={factsSummary.variance.vs_sdly_pct} label="SDLY" />
                    </div>
                  </div>
                  {/* Covers with variance */}
                  <div className="space-y-1">
                    <div className="text-2xl font-bold tabular-nums">
                      {formatNumber(report.summary.total_covers || 0)}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase">Covers</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <VarianceBadge value={factsSummary.variance.vs_forecast_covers_pct} label="Fcst" />
                      <VarianceBadge value={factsSummary.variance.vs_sdlw_covers_pct} label="SDLW" />
                      <VarianceBadge value={factsSummary.variance.vs_sdly_covers_pct} label="SDLY" />
                    </div>
                  </div>
                  {/* Forecast context */}
                  {factsSummary.forecast?.net_sales && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums text-muted-foreground">
                        {formatCurrency(factsSummary.forecast.net_sales)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">Forecast</div>
                      <div className="text-xs text-muted-foreground">
                        Range: {formatCurrency(factsSummary.forecast.net_sales_lower || 0)} - {formatCurrency(factsSummary.forecast.net_sales_upper || 0)}
                      </div>
                    </div>
                  )}
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
                  {/* PTD (Period-to-Date) */}
                  {factsSummary.variance.ptd_net_sales != null && factsSummary.variance.ptd_net_sales > 0 && (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold tabular-nums">
                        {formatCurrency(factsSummary.variance.ptd_net_sales)}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase">PTD Sales</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <VarianceBadge value={factsSummary.variance.vs_ptd_pct} label="vs LW" />
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            {factsSummary && (
              <>
                <StatCard
                  label="Food"
                  value={formatCurrency(factsSummary.food_sales || 0)}
                  icon={<UtensilsCrossed className="h-5 w-5 text-brass" />}
                />
                <StatCard
                  label="Beverage"
                  value={formatCurrency(factsSummary.beverage_sales || 0)}
                  icon={<DollarSign className="h-5 w-5 text-sage" />}
                />
                <StatCard
                  label="Bev %"
                  value={`${(factsSummary.beverage_pct || 0).toFixed(1)}%`}
                  icon={<Percent className="h-5 w-5 text-sage" />}
                />
              </>
            )}
          </div>

          {/* Labor Metrics */}
          {factsSummary?.labor && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard
                label="SPLH"
                value={formatCurrency(factsSummary.labor.splh || 0)}
                icon={<TrendingUp className="h-5 w-5 text-brass" />}
              />
              <StatCard
                label="Covers/Hr"
                value={factsSummary.labor.covers_per_labor_hour
                  ? factsSummary.labor.covers_per_labor_hour.toFixed(1)
                  : '—'}
                icon={<Users className="h-5 w-5 text-brass" />}
              />
              <StatCard
                label="Labor %"
                value={`${(factsSummary.labor.labor_pct || 0).toFixed(1)}%`}
                icon={<Percent className="h-5 w-5 text-sage" />}
              />
              <StatCard
                label="Total Hours"
                value={`${(factsSummary.labor.total_hours || 0).toFixed(1)}`}
                icon={<Clock className="h-5 w-5 text-muted-foreground" />}
              />
              <StatCard
                label="OT Hours"
                value={`${(factsSummary.labor.ot_hours || 0).toFixed(1)}`}
                icon={<AlertTriangle className={`h-5 w-5 ${factsSummary.labor.ot_hours > 0 ? 'text-error' : 'text-muted-foreground'}`} />}
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
