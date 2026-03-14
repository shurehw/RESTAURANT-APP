'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentAtTable } from '@/components/procurement/AgentAtTable';
import {
  Brain,
  Activity,
  Package,
  Truck,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
  Radio,
  Eye,
  ShoppingCart,
  TrendingDown,
  Clock,
  Shield,
  BarChart3,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface DashboardData {
  activity: {
    total_runs: number;
    runs_last_24h: number;
    runs_last_7d: number;
    total_pos_generated: number;
    total_pos_auto_executed: number;
    total_pos_dispatched: number;
    total_po_value: number;
    total_anomalies_detected: number;
  };
  savings: {
    total_bundle_savings: number;
    total_transfer_savings: number;
    total_savings: number;
    bundle_count: number;
    transfer_count: number;
  };
  followups: {
    total_pending: number;
    total_executed: number;
    confirmation_requests_sent: number;
    escalations_sent: number;
    at_risk_alerts: number;
    missed_deliveries: number;
  };
  recent_runs: Array<{
    run_id: string;
    venue_name: string;
    venue_id: string;
    triggered_by: string;
    items_evaluated: number;
    pos_generated: number;
    pos_auto_executed: number;
    started_at: string;
    status: string;
  }>;
  pending_bundles: number;
  pending_transfers: number;
  unmatched_receipts: number;
  invoice_disputes: number;
}

interface AgentAction {
  id: number;
  type: 'classify' | 'generate_po' | 'dispatch' | 'anomaly' | 'bundle' | 'rebalance' | 'followup' | 'match';
  item_name: string;
  venue_name: string;
  detail: string;
  value?: number;
  severity: 'info' | 'success' | 'warning' | 'critical';
  state: 'analyzing' | 'processing' | 'deciding' | 'complete';
  timestamp: Date;
}

// ── Simulated action generator ─────────────────────────────

const ITEMS = [
  'Cocktail Napkins', 'Grey Goose 750ml', 'Wagyu Strip', 'Truffle Oil',
  'Champagne Flutes', 'Lobster Tails', 'Printer Paper', 'Hand Soap',
  'Ketel One 1L', 'Organic Lemons', 'Bar Towels', 'Patron Silver',
  'Salmon Filet', 'Cleaning Spray', 'Table Linens', 'Hennessy VS',
];

const VENUES = ['Delilah LA', 'Delilah Miami', 'The Nice Guy', 'Delilah Dallas'];
const VENDORS = ['SHW Distribution', 'E&E Mercantile', 'Shureprint', 'GroundOps', 'US Foods', 'Sysco'];
const ENTITIES = ['shw', 'ee_mercantile', 'shureprint', 'groundops', 'external'];

function generateAction(id: number): AgentAction {
  const r = Math.random();
  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
  const venue = VENUES[Math.floor(Math.random() * VENUES.length)];
  const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)];
  const entity = ENTITIES[Math.floor(Math.random() * ENTITIES.length)];

  if (r < 0.2) {
    return {
      id, type: 'classify', item_name: item, venue_name: venue,
      detail: `Classified → ${entity.replace('_', ' ').toUpperCase()}. Routed to ${vendor}.`,
      severity: 'info', state: 'analyzing', timestamp: new Date(),
    };
  } else if (r < 0.45) {
    const amount = Math.round(200 + Math.random() * 2800);
    const tier = amount < 500 ? 'auto' : amount < 2500 ? 'manager' : 'executive';
    return {
      id, type: 'generate_po', item_name: item, venue_name: venue,
      detail: `PO #${1200 + id} → ${vendor} ($${amount}). Tier: ${tier}${tier === 'auto' ? ' ✓ auto-executed' : ' — awaiting approval'}.`,
      value: amount,
      severity: tier === 'auto' ? 'success' : 'warning',
      state: 'analyzing', timestamp: new Date(),
    };
  } else if (r < 0.55) {
    return {
      id, type: 'dispatch', item_name: item, venue_name: venue,
      detail: `PO dispatched to ${vendor} via email. Status → ordered. Follow-ups scheduled (T-48h, T-24h, T-4h).`,
      severity: 'success', state: 'analyzing', timestamp: new Date(),
    };
  } else if (r < 0.65) {
    const spike = Math.round(150 + Math.random() * 200);
    return {
      id, type: 'anomaly', item_name: item, venue_name: venue,
      detail: `Consumption spike detected: ${spike}% above 30-day baseline. ${Math.random() > 0.5 ? 'Likely event-driven — no action.' : 'Investigating — possible waste issue.'}`,
      severity: 'warning', state: 'analyzing', timestamp: new Date(),
    };
  } else if (r < 0.75) {
    const savings = Math.round(50 + Math.random() * 400);
    const venues = VENUES.slice(0, 2 + Math.floor(Math.random() * 2)).join(', ');
    return {
      id, type: 'bundle', item_name: item, venue_name: venues,
      detail: `Bundle opportunity: ${item} across ${venues}. Volume break saves $${savings} (${Math.round(3 + Math.random() * 12)}%).`,
      value: savings,
      severity: 'info', state: 'analyzing', timestamp: new Date(),
    };
  } else if (r < 0.85) {
    const fromVenue = VENUES[0];
    const toVenue = VENUES[1];
    const surplus = Math.round(140 + Math.random() * 60);
    return {
      id, type: 'rebalance', item_name: item, venue_name: `${fromVenue} → ${toVenue}`,
      detail: `${fromVenue} at ${surplus}% par, ${toVenue} below reorder. Transfer proposed — saves vs new PO.`,
      severity: 'info', state: 'analyzing', timestamp: new Date(),
    };
  } else if (r < 0.92) {
    const types = ['confirmation_request', 'escalation', 'at_risk_alert', 'missed_delivery'];
    const fType = types[Math.floor(Math.random() * types.length)];
    return {
      id, type: 'followup', item_name: item, venue_name: venue,
      detail: `Follow-up: ${fType.replace(/_/g, ' ')} for PO from ${vendor}. ${fType === 'missed_delivery' ? 'Debit memo staged.' : 'Notification sent to manager.'}`,
      severity: fType === 'missed_delivery' ? 'critical' : fType === 'at_risk_alert' ? 'warning' : 'info',
      state: 'analyzing', timestamp: new Date(),
    };
  } else {
    return {
      id, type: 'match', item_name: item, venue_name: venue,
      detail: `Receipt matched to PO #${1100 + Math.floor(Math.random() * 100)}. ${Math.random() > 0.3 ? 'Full match — clean.' : 'Partial: 2 items short-shipped. Variance flagged.'}`,
      severity: Math.random() > 0.3 ? 'success' : 'warning',
      state: 'analyzing', timestamp: new Date(),
    };
  }
}

// ── Page ───────────────────────────────────────────────────

export default function ProcurementAgentLivePage() {
  const { selectedVenue } = useVenue();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const counterRef = useRef(0);

  const venueId = selectedVenue?.id && selectedVenue.id !== 'all'
    ? selectedVenue.id
    : undefined;

  // Fetch real dashboard data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = venueId ? `?venue_id=${venueId}` : '';
      const res = await fetch(`/api/procurement/agent/dashboard${params}`);
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
      }
    } catch (err) {
      console.error('[procurement-agent-live] dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Simulate incoming agent actions
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      counterRef.current += 1;
      const newAction = generateAction(counterRef.current);
      setActions((prev) => [newAction, ...prev].slice(0, 20));

      // Animate through states
      setTimeout(() => {
        setActions((prev) =>
          prev.map((a) => (a.id === newAction.id ? { ...a, state: 'processing' as const } : a)),
        );
      }, 700);
      setTimeout(() => {
        setActions((prev) =>
          prev.map((a) => (a.id === newAction.id ? { ...a, state: 'deciding' as const } : a)),
        );
      }, 1600);
      setTimeout(() => {
        setActions((prev) =>
          prev.map((a) => (a.id === newAction.id ? { ...a, state: 'complete' as const } : a)),
        );
      }, 2500);
    }, 4000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const d = dashboard;

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            {isRunning && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Procurement Agent — Live Demo</h1>
            <p className="text-sm text-muted-foreground">
              Dashboard metrics are live; the action feed below is simulated for demo visualization
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={isRunning
              ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              : 'bg-muted text-muted-foreground'}
          >
            <Radio className="h-3 w-3 mr-1" />
            {isRunning ? 'SIMULATED' : 'PAUSED'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Left: Main feed */}
        <div className="space-y-4">
          {/* Agent Mode Banner */}
          <Card className="overflow-hidden">
            <div className="h-1 bg-emerald-500" />
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Agent Mode</p>
                    <p className="text-2xl font-bold text-emerald-500">
                      {loading ? '...' : 'Active'}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <MiniStat label="Runs (24h)" value={`${d?.activity.runs_last_24h || 0}`} />
                    <MiniStat label="POs Generated" value={`${d?.activity.total_pos_generated || 0}`} />
                    <MiniStat label="Dispatched" value={`${d?.activity.total_pos_dispatched || 0}`} />
                    <MiniStat label="PO Value" value={`$${formatK(d?.activity.total_po_value || 0)}`} />
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {d?.activity.runs_last_7d || 0} runs / 7d
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Pipeline Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                <PipelineCell
                  label="Pending Bundles"
                  value={d?.pending_bundles || 0}
                  color={d?.pending_bundles ? 'amber' : 'emerald'}
                  icon={<ShoppingCart className="h-3.5 w-3.5" />}
                />
                <PipelineCell
                  label="Pending Transfers"
                  value={d?.pending_transfers || 0}
                  color={d?.pending_transfers ? 'amber' : 'emerald'}
                  icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                />
                <PipelineCell
                  label="Unmatched Receipts"
                  value={d?.unmatched_receipts || 0}
                  color={d?.unmatched_receipts ? 'red' : 'emerald'}
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                />
                <PipelineCell
                  label="Invoice Disputes"
                  value={d?.invoice_disputes || 0}
                  color={d?.invoice_disputes ? 'red' : 'emerald'}
                  icon={<XCircle className="h-3.5 w-3.5" />}
                />
              </div>
            </CardContent>
          </Card>

          {/* Live Action Feed */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Action Feed (Simulated)
                {isRunning && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Waiting for agent activity...
                  </p>
                ) : (
                  actions.map((action) => <ActionCard key={action.id} action={action} />)
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Agent Status Panel */}
        <div className="space-y-4">
          {/* Agent Animation */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <AgentAtTable className="w-full h-48" />
            </CardContent>
          </Card>

          {/* Agent Config */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Agent Config</span>
              </div>
              <div className="space-y-3 text-xs">
                <StatusRow label="Policy" value="procurement-v1" />
                <StatusRow label="Mode" value="Auto Low" badge />
                <StatusRow label="Entity Routing" value="Enabled" />
                <div className="border-t pt-2 mt-2">
                  <p className="text-muted-foreground font-medium mb-1">Approval Tiers</p>
                  <StatusRow label="Auto-Execute" value="< $500" />
                  <StatusRow label="Manager" value="$500 – $2,500" />
                  <StatusRow label="Executive" value="> $2,500" />
                </div>
                <div className="border-t pt-2 mt-2">
                  <p className="text-muted-foreground font-medium mb-1">Hard Constraints</p>
                  <StatusRow label="Min Vendor Grade" value="C (70)" />
                  <StatusRow label="Cross-Venue Bundle" value="Enabled" />
                  <StatusRow label="Auto-Substitute" value="Rules only" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Savings Tracker */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Savings Captured</span>
              </div>
              <div className="text-center mb-3">
                <p className="text-3xl font-bold tabular-nums text-emerald-500">
                  ${formatK(d?.savings.total_savings || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">total procurement savings</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <LiveCounter
                  label="Bundle Savings"
                  value={`$${formatK(d?.savings.total_bundle_savings || 0)}`}
                  subtext={`${d?.savings.bundle_count || 0} bundles`}
                  icon={<ShoppingCart className="h-3.5 w-3.5 text-blue-500" />}
                />
                <LiveCounter
                  label="Transfer Savings"
                  value={`$${formatK(d?.savings.total_transfer_savings || 0)}`}
                  subtext={`${d?.savings.transfer_count || 0} transfers`}
                  icon={<ArrowRightLeft className="h-3.5 w-3.5 text-amber-500" />}
                />
              </div>
            </CardContent>
          </Card>

          {/* Follow-up Status */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Follow-up Pipeline</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <FollowupRow
                  label="Pending"
                  value={d?.followups.total_pending || 0}
                  color="amber"
                />
                <FollowupRow
                  label="Confirmations Sent"
                  value={d?.followups.confirmation_requests_sent || 0}
                  color="blue"
                />
                <FollowupRow
                  label="Escalations"
                  value={d?.followups.escalations_sent || 0}
                  color="amber"
                />
                <FollowupRow
                  label="At-Risk Alerts"
                  value={d?.followups.at_risk_alerts || 0}
                  color="red"
                />
                <FollowupRow
                  label="Missed Deliveries"
                  value={d?.followups.missed_deliveries || 0}
                  color="red"
                />
              </div>
            </CardContent>
          </Card>

          {/* Processing Pipeline */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Processing Pipeline</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {[
                  { name: 'Entity Classifier', status: 'online' },
                  { name: 'Anomaly Detector', status: 'online' },
                  { name: 'Auto-PO Generator', status: 'online' },
                  { name: 'Order Dispatch', status: 'online' },
                  { name: 'Receipt Matcher', status: 'online' },
                  { name: '3-Way Match', status: 'online' },
                  { name: 'Bundler', status: 'online' },
                  { name: 'Rebalancer', status: 'online' },
                  { name: 'Seasonality Engine', status: 'online' },
                ].map((model) => (
                  <div key={model.name} className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground">{model.name}</span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {model.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PipelineCell({
  label, value, color, icon,
}: {
  label: string; value: number; color: string; icon: React.ReactNode;
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-500 bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colorClasses[color] || ''}`}>
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px]">{label}</p>
    </div>
  );
}

function ActionCard({ action }: { action: AgentAction }) {
  const typeIcon: Record<string, React.ReactNode> = {
    classify: <Brain className="h-4 w-4 text-blue-500" />,
    generate_po: <ShoppingCart className="h-4 w-4 text-primary" />,
    dispatch: <Truck className="h-4 w-4 text-emerald-500" />,
    anomaly: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    bundle: <Package className="h-4 w-4 text-blue-500" />,
    rebalance: <ArrowRightLeft className="h-4 w-4 text-amber-500" />,
    followup: <Clock className="h-4 w-4 text-amber-500" />,
    match: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  };

  const typeLabel: Record<string, string> = {
    classify: 'Entity Classification',
    generate_po: 'PO Generation',
    dispatch: 'Order Dispatch',
    anomaly: 'Anomaly Detection',
    bundle: 'Bundle Analysis',
    rebalance: 'Rebalancing',
    followup: 'Follow-up',
    match: 'Receipt Match',
  };

  const stateLabel: Record<string, string> = {
    analyzing: 'Analyzing signals...',
    processing: 'Running models...',
    deciding: 'Computing decision...',
    complete: '',
  };

  const severityBorder: Record<string, string> = {
    info: 'border-blue-500/30',
    success: 'border-emerald-500/30',
    warning: 'border-amber-500/30',
    critical: 'border-red-500/30',
  };

  const isProcessing = action.state !== 'complete';

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-500 ${
        isProcessing
          ? 'border-primary/30 bg-primary/5'
          : severityBorder[action.severity] || 'border-border'
      }`}
    >
      {isProcessing ? (
        <div className="flex items-center gap-3">
          <div className="relative">
            <Brain className="h-5 w-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{action.item_name}</span>
              <span className="text-xs text-muted-foreground">{action.venue_name}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-xs text-primary animate-pulse">{stateLabel[action.state]}</span>
            </div>
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{
                  width: action.state === 'analyzing' ? '20%' : action.state === 'processing' ? '55%' : '85%',
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          {typeIcon[action.type]}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {typeLabel[action.type]}
              </span>
              <span className="text-xs text-muted-foreground">{action.venue_name}</span>
              {action.value && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 ml-auto shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                >
                  ${action.value}
                </Badge>
              )}
              {action.severity === 'critical' && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 ml-auto shrink-0 bg-red-500/10 text-red-600 border-red-500/20"
                >
                  critical
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{action.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
          {value}
        </Badge>
      ) : (
        <span className="font-medium tabular-nums">{value}</span>
      )}
    </div>
  );
}

function FollowupRow({ label, value, color }: { label: string; value: number; color: string }) {
  const dotColors: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    emerald: 'bg-emerald-500',
  };
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function LiveCounter({
  label, value, subtext, icon,
}: {
  label: string; value: string; subtext: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">{icon}</div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-[9px] text-muted-foreground/60">{subtext}</p>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}
