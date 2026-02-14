/**
 * Preshift Briefing Page
 *
 * Unified enforcement view showing all active items from both pipelines
 * (manager_actions + feedback_objects). Managers review this before service
 * to see carried-forward items, new issues, and escalations.
 *
 * The rules are always on. The rails are fixed.
 * Calibration is allowed. Escape is not.
 */

'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ClipboardCheck,
  History,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  RotateCcw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface UnifiedItem {
  source_table: 'manager_action' | 'feedback_object';
  source_id: string;
  venue_id: string;
  business_date: string;
  title: string;
  description: string;
  action_required: string;
  priority_rank: number;
  priority_label: string;
  severity: string;
  category: string;
  status: string;
  assigned_to: string | null;
  assigned_role: string | null;
  current_owner: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  escalation_reason: string | null;
  age_hours: number;
  metadata: Record<string, any> | null;
}

interface VerificationOutcome {
  id: string;
  evaluated_at: string;
  result: 'pass' | 'fail' | 'insufficient_data';
  verification_spec: {
    metric: string;
    operator: string;
    target: number;
    window_days: number;
  };
  measured_values: {
    measured?: number;
    metric?: string;
    target?: number;
    daily_values?: Array<{ date: string; value: number }>;
  };
  window_start: string;
  window_end: string;
  days_with_data: number;
  successor_id: string | null;
  feedback_object_id: string;
  feedback_objects: {
    venue_id: string;
    title: string;
    domain: string;
    severity: string;
  };
}

interface PreshiftData {
  success: boolean;
  business_date: string;
  items: UnifiedItem[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    carried_forward: number;
    new_today: number;
    escalated: number;
  };
  briefing: {
    id: string;
    reviewed: boolean;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
  } | null;
  attestation_blocked: boolean;
  recent_verifications: VerificationOutcome[];
}

// ── Helpers ────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}

function formatAge(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const severityConfig: Record<
  string,
  { bg: string; border: string; icon: string; badge: string }
> = {
  critical: {
    bg: 'bg-error/5',
    border: 'border-error/50',
    icon: 'text-error',
    badge: 'bg-error/20 text-error',
  },
  warning: {
    bg: 'bg-yellow-500/5',
    border: 'border-yellow-500/50',
    icon: 'text-yellow-600',
    badge: 'bg-yellow-500/20 text-yellow-700',
  },
  info: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/50',
    icon: 'text-blue-600',
    badge: 'bg-blue-500/20 text-blue-700',
  },
};

function getSeverityIcon(severity: string) {
  if (severity === 'critical') return ShieldAlert;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}

function getSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'ai_comp_review':
      return 'AI Comp Review';
    case 'ai_server_coaching':
      return 'Server Coaching';
    case 'attestation_comp':
      return 'Comp Attestation';
    case 'attestation_incident':
      return 'Incident';
    case 'attestation_coaching':
      return 'Coaching';
    case 'feedback_spine':
      return 'Feedback';
    default:
      return sourceType;
  }
}

// ── Component ──────────────────────────────────────────────────

export default function PreshiftPage() {
  const { selectedVenue } = useVenue();
  const [data, setData] = useState<PreshiftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingItem, setProcessingItem] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const businessDate = getBusinessDate();

  const fetchData = useCallback(async () => {
    if (!selectedVenue?.id || selectedVenue.id === 'all') return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/preshift?venue_id=${selectedVenue.id}&date=${businessDate}`,
        { credentials: 'include' }
      );

      if (!res.ok) throw new Error('Failed to fetch preshift briefing');

      const json: PreshiftData = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVenue?.id, businessDate]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleAction(
    sourceTable: 'manager_action' | 'feedback_object',
    sourceId: string,
    action: string
  ) {
    setProcessingItem(sourceId);
    try {
      const res = await fetch('/api/preshift/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_table: sourceTable,
          source_id: sourceId,
          action,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Action failed');
      }

      await fetchData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setProcessingItem(null);
    }
  }

  async function handleAcknowledge() {
    if (!selectedVenue?.id) return;
    setAcknowledging(true);

    try {
      const res = await fetch('/api/preshift/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          venue_id: selectedVenue.id,
          business_date: businessDate,
        }),
      });

      if (!res.ok) throw new Error('Failed to acknowledge briefing');
      await fetchData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAcknowledging(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Preshift Briefing</h1>
              <p className="text-muted-foreground mt-1">
                Active enforcement items for {businessDate}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
              <VenueQuickSwitcher />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Venue required */}
        {selectedVenue?.id === 'all' ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Select a venue to view the preshift briefing
              </p>
            </CardContent>
          </Card>
        ) : loading && !data ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">
                Loading preshift briefing...
              </p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-error/50 bg-error/5">
            <CardContent className="p-6">
              <p className="text-error">Error: {error}</p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            {/* Briefing Review Banner */}
            {data.briefing?.reviewed ? (
              <div className="rounded-lg border border-green-500/50 bg-green-500/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    Briefing reviewed{' '}
                    {data.briefing.reviewed_at &&
                      formatDateTime(data.briefing.reviewed_at)}
                  </span>
                </div>
              </div>
            ) : data.counts.total > 0 ? (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-700">
                    Briefing not yet reviewed &mdash; {data.counts.total} items
                    require attention
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                >
                  {acknowledging ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4 mr-1" />
                  )}
                  Mark as Reviewed
                </Button>
              </div>
            ) : null}

            {/* Attestation Gate Warning */}
            {data.attestation_blocked && (
              <div className="rounded-lg border-2 border-error bg-error/10 p-4 flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-error flex-shrink-0" />
                <div>
                  <p className="font-semibold text-error text-sm">
                    Attestation Blocked
                  </p>
                  <p className="text-sm text-error/80">
                    Critical feedback items must be resolved before tonight's
                    attestation can be submitted.
                  </p>
                </div>
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-muted">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{data.counts.total}</div>
                  <div className="text-sm text-muted-foreground">
                    Total Items
                  </div>
                </CardContent>
              </Card>
              <Card className="border-error/50 bg-error/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-error">
                    {data.counts.critical}
                  </div>
                  <div className="text-sm text-muted-foreground">Critical</div>
                </CardContent>
              </Card>
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-yellow-700">
                    {data.counts.carried_forward}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Carried Forward
                  </div>
                </CardContent>
              </Card>
              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-700">
                    {data.counts.escalated}
                  </div>
                  <div className="text-sm text-muted-foreground">Escalated</div>
                </CardContent>
              </Card>
            </div>

            {/* Item List */}
            {data.items.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All Clear</h3>
                  <p className="text-muted-foreground">
                    No active enforcement items for {selectedVenue?.name}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {data.items.map((item) => {
                  const config =
                    severityConfig[item.severity] || severityConfig.info;
                  const Icon = getSeverityIcon(item.severity);
                  const isCarriedForward =
                    item.business_date < data.business_date;
                  const isExpanded = expandedItems.has(item.source_id);
                  const isProcessing = processingItem === item.source_id;

                  return (
                    <Card
                      key={`${item.source_table}-${item.source_id}`}
                      className={`border ${config.border} ${config.bg} ${
                        isCarriedForward ? 'border-l-4' : ''
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          {/* Left side: icon + content */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Icon
                              className={`h-5 w-5 ${config.icon} mt-0.5 flex-shrink-0`}
                            />
                            <div className="flex-1 min-w-0">
                              {/* Title row with badges */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-semibold text-sm truncate">
                                  {item.title}
                                </h3>
                                <span
                                  className={`px-1.5 py-0.5 text-xs font-medium rounded ${config.badge}`}
                                >
                                  {item.severity}
                                </span>
                                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground">
                                  {item.category}
                                </span>
                                {isCarriedForward && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-orange-500/20 text-orange-700 flex items-center gap-1">
                                    <History className="h-3 w-3" />
                                    From {formatDate(item.business_date)}
                                  </span>
                                )}
                                {item.status === 'escalated' && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-purple-500/20 text-purple-700 flex items-center gap-1">
                                    <ArrowUpRight className="h-3 w-3" />
                                    {item.escalated_to || 'Escalated'}
                                  </span>
                                )}
                              </div>

                              {/* Meta row */}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatAge(item.age_hours)}
                                </span>
                                <span>{getSourceLabel(item.source_type)}</span>
                                {item.current_owner && (
                                  <span>Owner: {item.current_owner}</span>
                                )}
                              </div>

                              {/* Expandable description */}
                              <button
                                onClick={() => toggleExpand(item.source_id)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                                {isExpanded ? 'Hide details' : 'Show details'}
                              </button>

                              {isExpanded && (
                                <div className="mt-2 space-y-2">
                                  <p className="text-sm text-muted-foreground">
                                    {item.description}
                                  </p>
                                  {item.action_required && (
                                    <div className="p-2 bg-background/50 rounded text-xs">
                                      <span className="font-medium">
                                        Required:{' '}
                                      </span>
                                      {item.action_required}
                                    </div>
                                  )}
                                  {item.escalation_reason && (
                                    <p className="text-xs text-purple-600">
                                      Escalation reason:{' '}
                                      {item.escalation_reason}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right side: action buttons */}
                          <div className="flex gap-2 flex-shrink-0">
                            {item.source_table === 'manager_action' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() =>
                                    handleAction(
                                      item.source_table,
                                      item.source_id,
                                      'complete'
                                    )
                                  }
                                  disabled={isProcessing}
                                  className="h-8 text-xs"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                  )}
                                  Done
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleAction(
                                      item.source_table,
                                      item.source_id,
                                      'dismiss'
                                    )
                                  }
                                  disabled={isProcessing}
                                  className="h-8 text-xs"
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Dismiss
                                </Button>
                              </>
                            ) : (
                              <>
                                {item.status === 'open' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleAction(
                                        item.source_table,
                                        item.source_id,
                                        'acknowledge'
                                      )
                                    }
                                    disabled={isProcessing}
                                    className="h-8 text-xs"
                                  >
                                    {isProcessing ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                    )}
                                    Ack
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() =>
                                    handleAction(
                                      item.source_table,
                                      item.source_id,
                                      'resolve'
                                    )
                                  }
                                  disabled={isProcessing}
                                  className="h-8 text-xs"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                  )}
                                  Resolve
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Recently Verified */}
            {data.recent_verifications && data.recent_verifications.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Recently Verified
                </h2>
                {data.recent_verifications.map((v) => {
                  const isPassed = v.result === 'pass';
                  const isFailed = v.result === 'fail';
                  const isInsufficient = v.result === 'insufficient_data';

                  return (
                    <Card
                      key={v.id}
                      className={`border ${
                        isPassed
                          ? 'border-green-500/50 bg-green-500/5'
                          : isFailed
                            ? 'border-error/50 bg-error/5'
                            : 'border-muted bg-muted/5'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {isPassed ? (
                            <BadgeCheck className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                          ) : isFailed ? (
                            <RotateCcw className="h-5 w-5 text-error mt-0.5 flex-shrink-0" />
                          ) : (
                            <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-semibold text-sm truncate">
                                {v.feedback_objects?.title || 'Feedback Item'}
                              </h3>
                              <span
                                className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                  isPassed
                                    ? 'bg-green-500/20 text-green-700'
                                    : isFailed
                                      ? 'bg-error/20 text-error'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {isPassed
                                  ? 'Verified'
                                  : isFailed
                                    ? 'Recurring'
                                    : 'Insufficient Data'}
                              </span>
                              {v.feedback_objects?.domain && (
                                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground">
                                  {v.feedback_objects.domain}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {isPassed
                                ? 'Behavior changed — enforcement proved effective'
                                : isFailed
                                  ? 'Behavior persisted — auto-escalated to next level'
                                  : 'Not enough data to evaluate during verification window'}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span>
                                {v.verification_spec?.metric?.replace(/_/g, ' ')}:{' '}
                                {v.measured_values?.measured !== undefined
                                  ? v.verification_spec?.metric === 'unapproved_comp_count'
                                    ? `${v.measured_values.measured} occurrences`
                                    : `${Number(v.measured_values.measured).toFixed(1)}%`
                                  : 'N/A'}{' '}
                                (target: {v.verification_spec?.operator}{' '}
                                {v.verification_spec?.target})
                              </span>
                              <span>
                                Window: {formatDate(v.window_start)} –{' '}
                                {formatDate(v.window_end)}
                              </span>
                              <span>
                                Evaluated {formatDateTime(v.evaluated_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Acknowledge Bar (sticky bottom) */}
            {data.counts.total > 0 && !data.briefing?.reviewed && (
              <div className="sticky bottom-0 bg-card border-t p-4 -mx-4 mt-8">
                <div className="container mx-auto flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {data.counts.total} items reviewed &mdash; mark this
                    briefing as complete
                  </p>
                  <Button
                    onClick={handleAcknowledge}
                    disabled={acknowledging}
                  >
                    {acknowledging ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                    )}
                    Mark Briefing as Reviewed
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
