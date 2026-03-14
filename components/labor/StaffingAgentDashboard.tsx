'use client';

/**
 * Staffing Agent Dashboard
 *
 * Real-time visualization of the scheduling agent's decisions.
 * Shows phase indicator, KPI cards, demand vs staffing chart,
 * pending adjustments with approve/reject, and decision timeline.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  PhoneCall,
  PhoneOff,
  Scissors,
  CalendarClock,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Bar,
} from 'recharts';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

interface AgentData {
  phase: 'pre_service' | 'mid_service' | 'inactive';
  businessDate: string;
  currentTime: string;
  hoursUntilService: number | null;
  thresholds: {
    cut_trigger_pct: number;
    callin_trigger_pct: number;
    target_splh: number;
    min_splh: number;
    min_foh_count: number;
    min_boh_count: number;
    ot_warning_hours: number;
  };
  forecast: { covers_predicted: number; revenue_predicted: number } | null;
  reservations: {
    totalCovers: number;
    confirmedCovers: number;
    pendingCovers: number;
    reservationCount: number;
    peakHourCovers: number;
    peakHour: string;
  };
  staffing: {
    total_scheduled: number;
    foh_scheduled: number;
    boh_scheduled: number;
    mgmt_scheduled: number;
    scheduled_labor_cost: number;
  };
  live: {
    covers: number;
    revenue: number;
    labor_cost: number;
    labor_hours: number;
    staff_on_floor: number;
    ot_hours: number;
    splh: number;
    last_updated: string;
  } | null;
  latestSnapshot: {
    recommended_action: string;
    variance_pct: number;
    remaining_demand_pct: number;
    current_splh: number;
    details: any;
    snapshot_time: string;
  } | null;
  pendingAdjustments: Array<{
    id: string;
    action_type: string;
    employee_name: string;
    position: string;
    reason: string;
    cost_savings: number;
    status: string;
    created_at: string;
  }>;
  adjustmentHistory: Array<{
    id: string;
    action_type: string;
    employee_name: string;
    position: string;
    reason: string;
    cost_savings: number;
    status: string;
    created_at: string;
    approved_at: string | null;
  }>;
  timeline: Array<{
    time: string;
    covers: number;
    revenue: number;
    staff: number;
    splh: number;
    forecasted_covers: number;
    variance: number;
    action: string;
    remaining_pct: number;
    shift_type: string;
  }>;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string; badgeVariant: 'sage' | 'brass' | 'error' | 'default' }> = {
  none: { label: 'Monitoring', icon: Activity, color: 'text-sage', badgeVariant: 'sage' },
  cut_staff: { label: 'Cut Staff', icon: Scissors, color: 'text-error', badgeVariant: 'error' },
  call_off: { label: 'Call Off', icon: PhoneOff, color: 'text-error', badgeVariant: 'error' },
  call_in_staff: { label: 'Call In', icon: PhoneCall, color: 'text-brass', badgeVariant: 'brass' },
  approaching_ot: { label: 'OT Risk', icon: AlertTriangle, color: 'text-brass', badgeVariant: 'brass' },
};

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export function StaffingAgentDashboard({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/labor/agent-status?venue_id=${venueId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch agent status:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAction = async (adjustmentId: string, action: 'approve' | 'reject') => {
    setActionLoading(adjustmentId);
    try {
      const res = await fetch('/api/labor/adjustments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: adjustmentId, action }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({} as any));
        console.error('Failed to process adjustment:', msg?.error || `HTTP ${res.status}`);
        return;
      }
      await fetchData();
    } catch (err) {
      console.error('Failed to process adjustment:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-16 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="h-64 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <div className="text-muted-foreground">Unable to load agent status</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <PhaseHeader data={data} venueName={venueName} />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <DemandSignalCard data={data} />
        <StaffingCard data={data} />
        <LaborEfficiencyCard data={data} />
        <AgentStatusCard data={data} />
      </div>

      {/* Pending Adjustments */}
      {data.pendingAdjustments.length > 0 && (
        <PendingAdjustmentsSection
          adjustments={data.pendingAdjustments}
          onAction={handleAction}
          actionLoading={actionLoading}
        />
      )}

      {/* Timeline Chart */}
      {data.timeline.length > 0 && (
        <TimelineChart data={data} />
      )}

      {/* Decision History */}
      {data.adjustmentHistory.length > 0 && (
        <DecisionHistory history={data.adjustmentHistory} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE HEADER
// ══════════════════════════════════════════════════════════════════════════

function PhaseHeader({ data, venueName }: { data: AgentData; venueName: string }) {
  const action = data.latestSnapshot?.recommended_action || 'none';
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.none;
  const Icon = config.icon;

  const phaseLabel = data.phase === 'pre_service'
    ? `Pre-Service — ${data.hoursUntilService}h until open`
    : data.phase === 'mid_service'
    ? 'Mid-Service — Live Monitoring'
    : 'Inactive — Outside Monitoring Window';

  const phaseColor = data.phase === 'mid_service'
    ? 'from-sage/10 to-white border-sage/30'
    : data.phase === 'pre_service'
    ? 'from-brass/10 to-white border-brass/30'
    : 'from-muted to-white border-border';

  return (
    <Card className={`p-6 bg-gradient-to-br ${phaseColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Staffing Agent
          </h2>
          <p className="text-sm text-muted-foreground">{venueName} — {data.businessDate}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`flex items-center gap-1.5 text-sm ${data.phase !== 'inactive' ? 'text-foreground' : 'text-muted-foreground'}`}>
              {data.phase !== 'inactive' ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sage" />
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              )}
              {phaseLabel}
            </div>
          </div>
        </div>

        {data.latestSnapshot && action !== 'none' && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Agent Recommendation</div>
              <Badge variant={config.badgeVariant} className="mt-1">
                <Icon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// KPI CARDS
// ══════════════════════════════════════════════════════════════════════════

function DemandSignalCard({ data }: { data: AgentData }) {
  const forecast = data.forecast?.covers_predicted || 0;
  const rezCovers = data.reservations.totalCovers;
  const liveCovers = data.live?.covers || 0;
  const isLive = data.phase === 'mid_service';

  const primaryCovers = isLive ? liveCovers : rezCovers;
  const primaryLabel = isLive ? 'Actual Covers' : 'Rez Covers';
  const rezPct = forecast > 0 ? Math.round((rezCovers / forecast) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Demand Signal</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{primaryCovers}</div>
        <div className="text-xs text-muted-foreground">{primaryLabel}</div>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Forecast</span>
            <span className="font-medium">{forecast}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Reservations</span>
            <span className="font-medium">{rezCovers} ({rezPct}%)</span>
          </div>
          {data.reservations.peakHourCovers > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Peak Hour</span>
              <span className="font-medium">{data.reservations.peakHour} ({data.reservations.peakHourCovers})</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StaffingCard({ data }: { data: AgentData }) {
  const isLive = data.phase === 'mid_service' && data.live;
  const onFloor = isLive ? data.live!.staff_on_floor : data.staffing.total_scheduled;
  const label = isLive ? 'On Floor' : 'Scheduled';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Staffing</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{onFloor}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">FOH</span>
            <span className="font-medium">{data.staffing.foh_scheduled}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">BOH</span>
            <span className="font-medium">{data.staffing.boh_scheduled}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Sched. Cost</span>
            <span className="font-medium">{fmt(data.staffing.scheduled_labor_cost)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LaborEfficiencyCard({ data }: { data: AgentData }) {
  const splh = data.live?.splh || data.latestSnapshot?.current_splh || 0;
  const targetSplh = data.thresholds.target_splh;
  const minSplh = data.thresholds.min_splh;
  const isLive = data.phase === 'mid_service';

  let splhColor = 'text-foreground';
  if (isLive && splh > 0) {
    if (splh >= targetSplh) splhColor = 'text-sage';
    else if (splh >= minSplh) splhColor = 'text-brass';
    else splhColor = 'text-error';
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Labor Efficiency</CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${splhColor}`}>
          {isLive && splh > 0 ? fmt(splh) : '—'}
        </div>
        <div className="text-xs text-muted-foreground">SPLH</div>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Target</span>
            <span className="font-medium">{fmt(targetSplh)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Min</span>
            <span className="font-medium">{fmt(minSplh)}</span>
          </div>
          {data.live && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Labor Cost</span>
              <span className="font-medium">{fmt(data.live.labor_cost)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AgentStatusCard({ data }: { data: AgentData }) {
  const action = data.latestSnapshot?.recommended_action || 'none';
  const config = ACTION_CONFIG[action] || ACTION_CONFIG.none;
  const variance = data.latestSnapshot?.variance_pct || 0;
  const remaining = data.latestSnapshot?.remaining_demand_pct || 0;

  const pendingCount = data.pendingAdjustments.length;
  const approvedToday = data.adjustmentHistory.filter(a => a.status === 'approved').length;
  const rejectedToday = data.adjustmentHistory.filter(a => a.status === 'rejected').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Agent Status</CardTitle>
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${config.color}`}>
          {config.label}
        </div>
        <div className="text-xs text-muted-foreground">Current recommendation</div>
        <div className="mt-3 space-y-1">
          {data.phase === 'mid_service' && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Variance</span>
                <span className={`font-medium ${variance < -10 ? 'text-error' : variance > 10 ? 'text-brass' : ''}`}>
                  {variance > 0 ? '+' : ''}{Math.round(variance)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-medium">{Math.round(remaining * 100)}%</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Pending</span>
            <span className={`font-medium ${pendingCount > 0 ? 'text-brass' : ''}`}>{pendingCount}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Today</span>
            <span className="font-medium">
              {approvedToday > 0 && <span className="text-sage">{approvedToday} approved</span>}
              {approvedToday > 0 && rejectedToday > 0 && ', '}
              {rejectedToday > 0 && <span className="text-error">{rejectedToday} rejected</span>}
              {approvedToday === 0 && rejectedToday === 0 && '—'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PENDING ADJUSTMENTS
// ══════════════════════════════════════════════════════════════════════════

function PendingAdjustmentsSection({
  adjustments,
  onAction,
  actionLoading,
}: {
  adjustments: AgentData['pendingAdjustments'];
  onAction: (id: string, action: 'approve' | 'reject') => void;
  actionLoading: string | null;
}) {
  const totalSavings = adjustments.reduce((sum, a) => sum + a.cost_savings, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Pending Recommendations
        </h3>
        {totalSavings > 0 && (
          <Badge variant="sage">
            Potential savings: {fmt(totalSavings)}
          </Badge>
        )}
      </div>

      {adjustments.map((adj) => {
        const actionCfg = ACTION_CONFIG[adj.action_type === 'early_cut' ? 'cut_staff' : adj.action_type] || ACTION_CONFIG.none;
        const Icon = actionCfg.icon;
        const isLoading = actionLoading === adj.id;

        return (
          <Card key={adj.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={actionCfg.badgeVariant}>
                    <Icon className="w-3 h-3 mr-1" />
                    {adj.action_type === 'early_cut' ? 'CUT' : adj.action_type === 'call_off' ? 'CALL OFF' : adj.action_type === 'call_in' ? 'CALL IN' : adj.action_type.toUpperCase()}
                  </Badge>
                  <span className="font-medium text-foreground">
                    {adj.employee_name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({adj.position})
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{adj.reason}</p>
              </div>

              <div className="flex items-center gap-2 ml-4">
                {adj.cost_savings > 0 && (
                  <div className="text-right mr-2">
                    <div className="text-xs text-muted-foreground">Savings</div>
                    <div className="text-sm font-bold text-sage">{fmt(adj.cost_savings)}</div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="sage"
                  disabled={isLoading}
                  onClick={() => onAction(adj.id, 'approve')}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => onAction(adj.id, 'reject')}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TIMELINE CHART
// ══════════════════════════════════════════════════════════════════════════

function TimelineChart({ data }: { data: AgentData }) {
  const chartData = data.timeline.map((t) => ({
    time: new Date(t.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    actual: t.covers,
    forecast: t.forecasted_covers,
    staff: t.staff,
    splh: t.splh,
    variance: t.variance,
  }));

  if (chartData.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Covers vs Forecast — Service Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="covers" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="staff" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => {
                if (name === 'splh') return [fmt(value), 'SPLH'];
                return [value, name];
              }}
            />
            <Area
              yAxisId="covers"
              type="monotone"
              dataKey="forecast"
              fill="#92A69C"
              fillOpacity={0.15}
              stroke="#92A69C"
              strokeDasharray="5 5"
              name="Forecast"
            />
            <Line
              yAxisId="covers"
              type="monotone"
              dataKey="actual"
              stroke="#1B1D1F"
              strokeWidth={2}
              dot={false}
              name="Actual Covers"
            />
            <Bar
              yAxisId="staff"
              dataKey="staff"
              fill="#C4A46B"
              fillOpacity={0.3}
              name="Staff"
              barSize={20}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DECISION HISTORY
// ══════════════════════════════════════════════════════════════════════════

function DecisionHistory({ history }: { history: AgentData['adjustmentHistory'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Decision Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {history.map((item) => {
            const statusIcon = item.status === 'approved'
              ? <CheckCircle className="w-4 h-4 text-sage" />
              : item.status === 'rejected'
              ? <XCircle className="w-4 h-4 text-error" />
              : item.status === 'expired'
              ? <Clock className="w-4 h-4 text-muted-foreground" />
              : <AlertTriangle className="w-4 h-4 text-brass" />;

            const time = new Date(item.created_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2 border-b border-border last:border-0"
              >
                {statusIcon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {item.action_type === 'early_cut' ? 'Cut' : item.action_type === 'call_off' ? 'Call Off' : item.action_type === 'call_in' ? 'Call In' : item.action_type}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">
                      {item.employee_name} ({item.position})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{item.reason}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-muted-foreground">{time}</div>
                  {item.cost_savings > 0 && (
                    <div className="text-xs font-medium text-sage">{fmt(item.cost_savings)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
