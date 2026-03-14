'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Package,
  Activity,
  Brain,
  TrendingDown,
  ShoppingCart,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  Radio,
  ExternalLink,
} from 'lucide-react';

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

export default function ProcurementAgentPage() {
  const { selectedVenue } = useVenue();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const venueId = selectedVenue?.id && selectedVenue.id !== 'all'
    ? selectedVenue.id
    : undefined;

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
      console.error('[procurement-agent] dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const d = dashboard;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Procurement Agent</h1>
            <p className="text-sm text-muted-foreground">
              Autonomous ordering, dispatch, tracking, and cost optimization
            </p>
          </div>
        </div>
        <Link href="/admin/procurement-agent/live">
          <Button variant="outline" size="sm" className="gap-2">
            <Radio className="h-3.5 w-3.5" />
            Live View
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Agent Runs (7d)"
          value={d?.activity.runs_last_7d || 0}
          icon={<Brain className="h-4 w-4 text-primary" />}
          loading={loading}
        />
        <KPICard
          label="POs Generated"
          value={d?.activity.total_pos_generated || 0}
          icon={<ShoppingCart className="h-4 w-4 text-blue-500" />}
          loading={loading}
        />
        <KPICard
          label="POs Dispatched"
          value={d?.activity.total_pos_dispatched || 0}
          icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
          loading={loading}
        />
        <KPICard
          label="Total Savings"
          value={`$${formatK(d?.savings.total_savings || 0)}`}
          icon={<TrendingDown className="h-4 w-4 text-emerald-500" />}
          loading={loading}
          highlight
        />
      </div>

      {/* Attention Items */}
      {d && (d.pending_bundles > 0 || d.pending_transfers > 0 || d.unmatched_receipts > 0 || d.invoice_disputes > 0) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {d.pending_bundles > 0 && (
                <AttentionItem label="Pending Bundles" value={d.pending_bundles} />
              )}
              {d.pending_transfers > 0 && (
                <AttentionItem label="Pending Transfers" value={d.pending_transfers} />
              )}
              {d.unmatched_receipts > 0 && (
                <AttentionItem label="Unmatched Receipts" value={d.unmatched_receipts} />
              )}
              {d.invoice_disputes > 0 && (
                <AttentionItem label="Invoice Disputes" value={d.invoice_disputes} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Runs */}
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
              No agent runs yet. The agent runs on a polling schedule when enabled.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">Venue</th>
                    <th className="text-left py-2 font-medium">Trigger</th>
                    <th className="text-right py-2 font-medium">Items</th>
                    <th className="text-right py-2 font-medium">POs</th>
                    <th className="text-right py-2 font-medium">Auto</th>
                    <th className="text-right py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recent_runs.map((run) => (
                    <tr key={run.run_id} className="border-b border-border/50">
                      <td className="py-2 font-medium">{run.venue_name}</td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {run.triggered_by}
                        </Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums">{run.items_evaluated}</td>
                      <td className="py-2 text-right tabular-nums">{run.pos_generated}</td>
                      <td className="py-2 text-right tabular-nums">{run.pos_auto_executed}</td>
                      <td className="py-2 text-right">
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

      {/* Savings Breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-blue-500" />
              Bundle Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-6">
            <p className="text-3xl font-bold tabular-nums text-blue-500">
              ${formatK(d?.savings.total_bundle_savings || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              from {d?.savings.bundle_count || 0} cross-venue bundles
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-amber-500" />
              Transfer Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-6">
            <p className="text-3xl font-bold tabular-nums text-amber-500">
              ${formatK(d?.savings.total_transfer_savings || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              from {d?.savings.transfer_count || 0} inter-venue transfers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Follow-up Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <FollowupStat label="Pending" value={d?.followups.total_pending || 0} color="amber" />
            <FollowupStat label="Confirmations" value={d?.followups.confirmation_requests_sent || 0} color="blue" />
            <FollowupStat label="Escalations" value={d?.followups.escalations_sent || 0} color="amber" />
            <FollowupStat label="At-Risk Alerts" value={d?.followups.at_risk_alerts || 0} color="red" />
            <FollowupStat label="Missed Deliveries" value={d?.followups.missed_deliveries || 0} color="red" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function KPICard({
  label, value, icon, loading, highlight,
}: {
  label: string; value: string | number; icon: React.ReactNode; loading: boolean; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-emerald-500/30 bg-emerald-500/5' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">{icon}</div>
        <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-emerald-500' : ''}`}>
          {loading ? '...' : value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function AttentionItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold tabular-nums text-amber-600">{value}</p>
      <p className="text-[10px] text-amber-600/80">{label}</p>
    </div>
  );
}

function FollowupStat({ label, value, color }: { label: string; value: number; color: string }) {
  const textColors: Record<string, string> = {
    blue: 'text-blue-500',
    amber: 'text-amber-500',
    red: 'text-red-500',
    emerald: 'text-emerald-500',
  };
  return (
    <div>
      <p className={`text-xl font-bold tabular-nums ${textColors[color]}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
