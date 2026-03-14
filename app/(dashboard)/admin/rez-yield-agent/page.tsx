'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentAtTable } from '@/components/rez-yield/AgentAtTable';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  BarChart,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────

interface BacktestRow {
  id: string;
  venue_id: string;
  business_date: string;
  actual_covers: number;
  actual_revenue: number;
  actual_utilization: number;
  actual_dead_gap_mins: number;
  actual_second_turns: number;
  engine_covers: number;
  engine_revenue: number;
  engine_utilization: number;
  engine_dead_gap_mins: number;
  engine_second_turns: number;
  revenue_delta: number;
  utilization_delta: number;
  covers_delta: number;
  narrative: string;
  recommendations: Array<{ type: string; detail: string }>;
}

interface DecisionRow {
  id: string;
  venue_id: string;
  business_date: string;
  recommendation: string;
  confidence: number;
  reasoning: string;
  payload: {
    party_size?: number;
    requested_time?: string;
    is_vip?: boolean;
    posture?: string;
    accept_value?: number;
    hold_value?: number;
    policy?: {
      risk_band?: string;
      auto_execute_eligible?: boolean;
      active_tier?: string;
    };
  };
  created_at: string;
}

interface Summary {
  total_days: number;
  positive_days: number;
  win_rate: number;
  total_revenue_delta: number;
  avg_revenue_delta: number;
  total_covers_delta: number;
}

// ── Page ───────────────────────────────────────────────────

export default function RezYieldAgentPage() {
  const { selectedVenue } = useVenue();
  const [loading, setLoading] = useState(true);
  const [backtests, setBacktests] = useState<BacktestRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const venueParam = selectedVenue?.id && selectedVenue.id !== 'all'
        ? `&venue_id=${selectedVenue.id}`
        : '';
      const res = await fetch(`/api/rez-yield/backtests?days=${days}${venueParam}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBacktests(data.backtests || []);
      setDecisions(data.decisions || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('[rez-yield-agent] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedVenue?.id, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Chart data ──

  const chartData = backtests.map((b) => ({
    date: b.business_date.slice(5), // "03-14"
    fullDate: b.business_date,
    revenueDelta: Number(b.revenue_delta) || 0,
    actualRevenue: Number(b.actual_revenue) || 0,
    engineRevenue: Number(b.engine_revenue) || 0,
    actualCovers: b.actual_covers,
    engineCovers: b.engine_covers,
    utilization: Number(b.actual_utilization) || 0,
    engineUtilization: Number(b.engine_utilization) || 0,
  }));

  // Decision breakdown for pie-like bar
  const decisionCounts = decisions.reduce(
    (acc, d) => {
      acc[d.recommendation] = (acc[d.recommendation] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const totalDecisions = decisions.length;

  // Risk band breakdown
  const riskCounts = decisions.reduce(
    (acc, d) => {
      const band = d.payload?.policy?.risk_band || 'unknown';
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Cumulative revenue delta
  let cumulativeDelta = 0;
  const cumulativeData = chartData.map((d) => {
    cumulativeDelta += d.revenueDelta;
    return { ...d, cumulativeDelta: Math.round(cumulativeDelta) };
  });

  // ── Render ──

  const tierLabel = 'Tier 0 — Advice Only';
  const tierColor = 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revenue Agent</h1>
            <p className="text-sm text-muted-foreground">
              Reservation yield engine — backtest performance & decision log
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={tierColor}>
            {tierLabel}
          </Badge>
          <div className="flex gap-1">
            {[7, 14, 30, 60].map((d) => (
              <Button
                key={d}
                variant={days === d ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : summary && summary.total_days === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AgentAtTable className="w-72 h-52 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No backtest data yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              The nightly backtest job runs after service close. Results will appear here once the engine has data to evaluate.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              title="Win Rate"
              value={`${summary?.win_rate || 0}%`}
              subtitle={`${summary?.positive_days || 0} of ${summary?.total_days || 0} days`}
              icon={<ShieldCheck className="h-4 w-4" />}
              trend={summary?.win_rate && summary.win_rate >= 60 ? 'positive' : 'neutral'}
            />
            <KpiCard
              title="Avg Daily Delta"
              value={`${(summary?.avg_revenue_delta || 0) >= 0 ? '+' : ''}$${Math.round(summary?.avg_revenue_delta || 0)}`}
              subtitle="Revenue engine would add per night"
              icon={<DollarSign className="h-4 w-4" />}
              trend={(summary?.avg_revenue_delta || 0) > 0 ? 'positive' : (summary?.avg_revenue_delta || 0) < 0 ? 'negative' : 'neutral'}
            />
            <KpiCard
              title="Total Delta"
              value={`${(summary?.total_revenue_delta || 0) >= 0 ? '+' : ''}$${Math.round(summary?.total_revenue_delta || 0).toLocaleString()}`}
              subtitle={`Over ${summary?.total_days || 0} nights`}
              icon={<TrendingUp className="h-4 w-4" />}
              trend={(summary?.total_revenue_delta || 0) > 0 ? 'positive' : (summary?.total_revenue_delta || 0) < 0 ? 'negative' : 'neutral'}
            />
            <KpiCard
              title="Covers Delta"
              value={`${(summary?.total_covers_delta || 0) >= 0 ? '+' : ''}${summary?.total_covers_delta || 0}`}
              subtitle="Net covers engine would change"
              icon={<Users className="h-4 w-4" />}
              trend={(summary?.total_covers_delta || 0) > 0 ? 'positive' : (summary?.total_covers_delta || 0) < 0 ? 'negative' : 'neutral'}
            />
          </div>

          {/* Main Chart: Cumulative Revenue Delta */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Cumulative Revenue Delta
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Running total of what the engine would have added or lost vs. actual decisions
              </p>
            </CardHeader>
            <CardContent>
              {cumulativeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={cumulativeData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: 11 }}
                      tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        `$${value.toLocaleString()}`,
                        name === 'cumulativeDelta' ? 'Cumulative Delta' : 'Nightly Delta',
                      ]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="cumulativeDelta"
                      fill="hsl(var(--primary) / 0.1)"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                    <Bar
                      dataKey="revenueDelta"
                      fill="hsl(var(--primary) / 0.3)"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={12}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                  No chart data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Two-column: Decision Breakdown + Revenue Comparison */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Decision Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Decision Breakdown</CardTitle>
                <p className="text-xs text-muted-foreground">{totalDecisions} evaluations in period</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <DecisionBar label="Accept" count={decisionCounts.accept || 0} total={totalDecisions} color="bg-emerald-500" />
                <DecisionBar label="Offer Alternate" count={decisionCounts.offer_alternate || 0} total={totalDecisions} color="bg-blue-500" />
                <DecisionBar label="Waitlist" count={decisionCounts.waitlist || 0} total={totalDecisions} color="bg-amber-500" />
                <DecisionBar label="Deny" count={decisionCounts.deny || 0} total={totalDecisions} color="bg-red-500" />

                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Risk Classification</p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      Low: {riskCounts.low || 0}
                    </Badge>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Med: {riskCounts.medium || 0}
                    </Badge>
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                      High: {riskCounts.high || 0}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actual vs Engine Revenue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Actual vs Engine Revenue</CardTitle>
                <p className="text-xs text-muted-foreground">Per-night comparison</p>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" style={{ fontSize: 10 }} />
                      <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.5rem',
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => [
                          `$${value.toLocaleString()}`,
                          name === 'actualRevenue' ? 'Actual' : 'Engine',
                        ]}
                      />
                      <Bar dataKey="actualRevenue" fill="hsl(var(--muted-foreground) / 0.3)" radius={[2, 2, 0, 0]} maxBarSize={10} name="actualRevenue" />
                      <Bar dataKey="engineRevenue" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} maxBarSize={10} name="engineRevenue" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                    No data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Decisions Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Agent Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No decisions recorded yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {decisions.slice(0, 20).map((d) => (
                    <DecisionLogRow key={d.id} decision={d} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recommendations from backtests */}
          {backtests.some((b) => b.recommendations && b.recommendations.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Agent Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {backtests
                    .filter((b) => b.recommendations && b.recommendations.length > 0)
                    .slice(-5)
                    .reverse()
                    .flatMap((b) =>
                      b.recommendations.map((r, i) => (
                        <div key={`${b.id}-${i}`} className="flex items-start gap-3 rounded-lg border p-3">
                          <Badge variant="outline" className="shrink-0 text-xs mt-0.5">
                            {b.business_date}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium capitalize">{r.type.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.detail}</p>
                          </div>
                        </div>
                      )),
                    )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend: 'positive' | 'negative' | 'neutral';
}) {
  const trendColor =
    trend === 'positive' ? 'text-emerald-600' : trend === 'negative' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <span className="text-muted-foreground/50">{icon}</span>
        </div>
        <p className={`text-2xl font-bold tracking-tight ${trendColor}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function DecisionBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium w-28 shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-16 text-right">
        {count} ({pct}%)
      </span>
    </div>
  );
}

function DecisionLogRow({ decision }: { decision: DecisionRow }) {
  const recIcon: Record<string, React.ReactNode> = {
    accept: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
    offer_alternate: <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />,
    waitlist: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    deny: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  };

  const recColor: Record<string, string> = {
    accept: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    offer_alternate: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    waitlist: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    deny: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  const p = decision.payload;
  const time = new Date(decision.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <span className="text-xs text-muted-foreground w-12 shrink-0">{time}</span>
      {recIcon[decision.recommendation] || <Activity className="h-3.5 w-3.5" />}
      <Badge variant="outline" className={`text-xs ${recColor[decision.recommendation] || ''}`}>
        {decision.recommendation.replace(/_/g, ' ')}
      </Badge>
      <span className="text-xs text-muted-foreground truncate flex-1">
        {p?.party_size && `${p.party_size}pax`}
        {p?.requested_time && ` @ ${p.requested_time}`}
        {p?.is_vip && ' VIP'}
        {p?.posture && ` | ${p.posture}`}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
        {Math.round(decision.confidence * 100)}%
      </span>
    </div>
  );
}
