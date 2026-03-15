'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  UtensilsCrossed,
  Activity,
  Brain,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  BarChart3,
  Target,
  Printer,
  Store,
} from 'lucide-react';

interface DashboardData {
  summary: {
    health_score: number | null;
    total_menu_items: number;
    critical_margin_breaches: number;
    warning_margin_breaches: number;
    underperformers: number;
    declining_items: number;
    pending_recommendations: number;
    margin_bleed_per_week: number;
    prices_queued: number;
    next_reprint_date: string | null;
    comp_set_venues: number;
    comp_set_items_matched: number;
  };
  recent_runs: Array<{
    id: string;
    venue_id: string;
    status: string;
    signals_detected: string[];
    recommendations_generated: number;
    auto_executed: number;
    started_at: string;
    completed_at: string | null;
    agent_reasoning: any;
  }>;
  pending_recommendations: Array<{
    id: string;
    signal_type: string;
    action_type: string;
    recipe_name: string;
    summary: string;
    approval_tier: string;
    status: string;
    created_at: string;
  }>;
  margin_bleed: {
    total_margin_bleed_per_week: number;
    total_queued: number;
    next_reprint_date: string | null;
    items: Array<{
      recipe_name: string;
      current_price: number;
      target_price: number;
      weekly_bleed: number;
      days_waiting: number;
    }>;
  };
  comp_set_positions: Array<{
    recipe_name: string;
    our_price: number;
    comp_median: number;
    headroom: number;
    comp_count: number;
  }>;
}

export default function MenuAgentPage() {
  const { selectedVenue } = useVenue();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const venueId =
    selectedVenue?.id && selectedVenue.id !== 'all'
      ? selectedVenue.id
      : undefined;

  const fetchDashboard = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      setDashboard(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/menu-agent/dashboard?venue_id=${venueId}`
      );
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
      }
    } catch (err) {
      console.error('[menu-agent] dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRecommendation = async (
    recId: string,
    action: 'approved' | 'rejected'
  ) => {
    setActionLoading(recId);
    try {
      const res = await fetch(
        `/api/menu-agent/recommendations?venue_id=${venueId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendation_id: recId, action }),
        }
      );
      if (res.ok) {
        await fetchDashboard();
      }
    } catch (err) {
      console.error('[menu-agent] recommendation action error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const d = dashboard;
  const s = d?.summary;

  if (!venueId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Menu Agent</h1>
            <p className="text-sm text-muted-foreground">
              Select a venue to view menu health and agent activity
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Menu Agent</h1>
            <p className="text-sm text-muted-foreground">
              Margin enforcement, pricing, comp set intelligence, and menu
              optimization
            </p>
          </div>
        </div>
        {s?.health_score != null && (
          <HealthScoreBadge score={s.health_score} loading={loading} />
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Menu Items"
          value={s?.total_menu_items || 0}
          icon={<UtensilsCrossed className="h-4 w-4 text-primary" />}
          loading={loading}
        />
        <KPICard
          label="Margin Breaches"
          value={
            (s?.critical_margin_breaches || 0) +
            (s?.warning_margin_breaches || 0)
          }
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          loading={loading}
          alert={
            (s?.critical_margin_breaches || 0) > 0
          }
        />
        <KPICard
          label="Underperformers"
          value={s?.underperformers || 0}
          icon={<TrendingDown className="h-4 w-4 text-amber-500" />}
          loading={loading}
        />
        <KPICard
          label="Margin Bleed / wk"
          value={`$${formatK(s?.margin_bleed_per_week || 0)}`}
          icon={<DollarSign className="h-4 w-4 text-red-500" />}
          loading={loading}
          alert={(s?.margin_bleed_per_week || 0) > 0}
        />
      </div>

      {/* Needs Attention */}
      {d &&
        ((s?.pending_recommendations || 0) > 0 ||
          (s?.prices_queued || 0) > 0 ||
          (s?.critical_margin_breaches || 0) > 0) && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(s?.pending_recommendations || 0) > 0 && (
                  <AttentionItem
                    label="Pending Recommendations"
                    value={s!.pending_recommendations}
                  />
                )}
                {(s?.critical_margin_breaches || 0) > 0 && (
                  <AttentionItem
                    label="Critical Breaches"
                    value={s!.critical_margin_breaches}
                  />
                )}
                {(s?.prices_queued || 0) > 0 && (
                  <AttentionItem
                    label="Prices Queued"
                    value={s!.prices_queued}
                    subtitle={
                      s?.next_reprint_date
                        ? `Next reprint: ${formatDate(s.next_reprint_date)}`
                        : undefined
                    }
                  />
                )}
                {(s?.declining_items || 0) > 0 && (
                  <AttentionItem
                    label="Declining Items"
                    value={s!.declining_items}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Recent Agent Runs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recent Agent Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!d?.recent_runs?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No agent runs yet. The menu agent runs daily at 6 AM when enabled.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Signals</th>
                    <th className="text-right py-2 font-medium">Recs</th>
                    <th className="text-right py-2 font-medium">Auto</th>
                    <th className="text-right py-2 font-medium">
                      Health
                    </th>
                    <th className="text-right py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recent_runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-border/50"
                    >
                      <td className="py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            run.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : run.status === 'failed'
                                ? 'bg-red-500/10 text-red-600 border-red-500/20'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          }`}
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {run.signals_detected?.map((sig) => (
                            <Badge
                              key={sig}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {signalLabel(sig)}
                            </Badge>
                          ))}
                          {(!run.signals_detected ||
                            run.signals_detected.length === 0) && (
                            <span className="text-muted-foreground">
                              clean
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {run.recommendations_generated}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {run.auto_executed}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {run.agent_reasoning?.health_score ?? '—'}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {formatTimestamp(run.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Recommendations + Margin Bleed */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Pending Recommendations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Pending Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!d?.pending_recommendations?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No pending recommendations
              </p>
            ) : (
              <div className="space-y-3">
                {d.pending_recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {rec.recipe_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rec.summary}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {signalLabel(rec.signal_type)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            rec.approval_tier === 'executive'
                              ? 'border-red-500/30 text-red-600'
                              : rec.approval_tier === 'manager'
                                ? 'border-amber-500/30 text-amber-600'
                                : 'border-blue-500/30 text-blue-600'
                          }`}
                        >
                          {rec.approval_tier}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-red-600 hover:bg-red-50"
                        disabled={actionLoading === rec.id}
                        onClick={() =>
                          handleRecommendation(rec.id, 'rejected')
                        }
                      >
                        <XCircle className="h-3 w-3" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={actionLoading === rec.id}
                        onClick={() =>
                          handleRecommendation(rec.id, 'approved')
                        }
                      >
                        <CheckCircle className="h-3 w-3" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Margin Bleed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Printer className="h-4 w-4 text-amber-500" />
              Reprint Queue &amp; Margin Bleed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!d?.margin_bleed?.items?.length ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  No prices waiting for reprint
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {d.margin_bleed.next_reprint_date && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/5 rounded-md px-3 py-2">
                    <Clock className="h-3.5 w-3.5" />
                    Next reprint: {formatDate(d.margin_bleed.next_reprint_date)}
                  </div>
                )}
                <div className="text-center py-2">
                  <p className="text-2xl font-bold tabular-nums text-red-500">
                    ${formatK(d.margin_bleed.total_margin_bleed_per_week)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    margin bleed / week across {d.margin_bleed.total_queued}{' '}
                    items
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-1.5 font-medium">Item</th>
                        <th className="text-right py-1.5 font-medium">
                          Current
                        </th>
                        <th className="text-right py-1.5 font-medium">
                          Target
                        </th>
                        <th className="text-right py-1.5 font-medium">
                          Bleed/wk
                        </th>
                        <th className="text-right py-1.5 font-medium">
                          Days
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.margin_bleed.items.slice(0, 8).map((item, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-border/50"
                        >
                          <td className="py-1.5 font-medium max-w-[120px] truncate">
                            {item.recipe_name}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            ${item.current_price}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-emerald-600">
                            ${item.target_price}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-red-500">
                            ${item.weekly_bleed.toFixed(0)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {item.days_waiting}
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
      </div>

      {/* Comp Set Positions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Store className="h-4 w-4 text-blue-500" />
            Comp Set Price Positions
            {s && (
              <span className="text-[10px] text-muted-foreground font-normal ml-auto">
                {s.comp_set_venues} venues &middot; {s.comp_set_items_matched}{' '}
                items matched
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!d?.comp_set_positions?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No comp set data yet. Add competitor venues to enable price
              positioning.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">Item</th>
                    <th className="text-right py-2 font-medium">Our Price</th>
                    <th className="text-right py-2 font-medium">
                      Comp Median
                    </th>
                    <th className="text-right py-2 font-medium">Headroom</th>
                    <th className="text-right py-2 font-medium">Comps</th>
                  </tr>
                </thead>
                <tbody>
                  {d.comp_set_positions.map((pos, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 font-medium">{pos.recipe_name}</td>
                      <td className="py-2 text-right tabular-nums">
                        ${pos.our_price}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        ${pos.comp_median}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-medium ${
                          pos.headroom > 0
                            ? 'text-emerald-600'
                            : 'text-red-500'
                        }`}
                      >
                        {pos.headroom > 0 ? '+' : ''}${pos.headroom.toFixed(0)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {pos.comp_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function HealthScoreBadge({
  score,
  loading,
}: {
  score: number;
  loading: boolean;
}) {
  const color =
    score >= 80
      ? 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10'
      : score >= 60
        ? 'text-amber-600 border-amber-500/30 bg-amber-500/10'
        : 'text-red-600 border-red-500/30 bg-red-500/10';

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${color}`}
    >
      <Target className="h-4 w-4" />
      <div className="text-right">
        <p className="text-xl font-bold tabular-nums">
          {loading ? '...' : score}
        </p>
        <p className="text-[10px]">Health Score</p>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  loading,
  alert,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  loading: boolean;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-red-500/30 bg-red-500/5' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">{icon}</div>
        <p
          className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-500' : ''}`}
        >
          {loading ? '...' : value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function AttentionItem({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold tabular-nums text-amber-600">{value}</p>
      <p className="text-[10px] text-amber-600/80">{label}</p>
      {subtitle && (
        <p className="text-[9px] text-amber-500/70 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function signalLabel(signal: string): string {
  const labels: Record<string, string> = {
    margin_breach: 'Margin',
    underperformer: 'Underperformer',
    menu_bloat: 'Bloat',
    cannibalization: 'Cannibalization',
    comp_set_gap: 'Comp Set',
  };
  return labels[signal] || signal;
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
