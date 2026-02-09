/**
 * Attestation Compliance Dashboard
 * Corporate oversight for attestation submission and violation tracking
 */

'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Loader2,
  Calendar,
  TrendingUp,
  ExternalLink,
  User,
} from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  range: { start: string; end: string };
  venues: Array<{ venue_id: string; name: string }>;
  compliance: {
    submitted: number;
    expected: number;
    pct: number;
    pending: number;
    late: number;
  };
  grid: Array<{
    venue_id: string;
    venue_name: string;
    days: Array<{
      date: string;
      state: 'submitted' | 'pending' | 'late' | 'not_applicable';
      attestation_id?: string;
      has_violations?: boolean;
      violation_count?: number;
    }>;
  }>;
  outstanding: Array<{
    venue_id: string;
    venue_name: string;
    business_date: string;
    state: 'pending' | 'late';
    due_at: string;
    attestation_id?: string;
  }>;
  rollups: {
    revenue_reasons: Array<{ reason: string; count: number }>;
    labor_reasons: Array<{ reason: string; count: number }>;
    comp_codes: Array<{ code: string; count: number }>;
    policy_violations: { count: number };
    incidents: Array<{ type: string; total: number; open: number; high_severity: number }>;
  };
}

export default function AttestationsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAttestation, setSelectedAttestation] = useState<any>(null);
  const [loadingDrawer, setLoadingDrawer] = useState(false);

  // Date range state (default: last 7 days)
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [daysBack, setDaysBack] = useState(7);

  const startDate = React.useMemo(() => {
    const d = new Date(endDate);
    d.setDate(d.getDate() - (daysBack - 1));
    return d.toISOString().split('T')[0];
  }, [endDate, daysBack]);

  useEffect(() => {
    fetchDashboard();
  }, [startDate, endDate]);

  async function fetchDashboard() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/attestations/dashboard?start_date=${startDate}&end_date=${endDate}`,
        { credentials: 'include' }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch dashboard: ${res.status}`);
      }

      const dashboardData = await res.json();
      setData(dashboardData);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function openAttestationDrawer(attestationId: string, venueId: string, businessDate: string) {
    setDrawerOpen(true);
    setLoadingDrawer(true);
    setSelectedAttestation(null);

    try {
      const res = await fetch(`/api/attestations/${attestationId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch attestation details');
      }

      const { data: attestationData } = await res.json();
      setSelectedAttestation({
        ...attestationData,
        venue_id: venueId,
        business_date: businessDate,
      });
    } catch (err: any) {
      console.error('Failed to load attestation:', err);
      setSelectedAttestation({
        error: err.message || 'Failed to load attestation details',
      });
    } finally {
      setLoadingDrawer(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-500">
          <CardContent className="p-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Attestation Compliance</h1>
              <p className="text-muted-foreground mt-1">
                Submission tracking and violation oversight
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Date Range Selector */}
              <select
                value={daysBack}
                onChange={(e) => setDaysBack(Number(e.target.value))}
                className="border rounded px-3 py-2"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Compliance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{data.compliance.pct}%</div>
                  <div className="text-sm text-muted-foreground">Compliance Rate</div>
                </div>
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {data.compliance.submitted} / {data.compliance.expected} submitted
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/50 bg-yellow-50/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-yellow-700">{data.compliance.pending}</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <Clock className="h-10 w-10 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-500/50 bg-red-50/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-red-700">{data.compliance.late}</div>
                  <div className="text-sm text-muted-foreground">Late/Missed</div>
                </div>
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-500/50 bg-orange-50/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-orange-700">
                    {data.rollups.policy_violations.count}
                  </div>
                  <div className="text-sm text-muted-foreground">Policy Violations</div>
                </div>
                <AlertTriangle className="h-10 w-10 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submission Status Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Submission Status Grid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-semibold">Venue</th>
                    {data.grid[0]?.days.map((day) => (
                      <th key={day.date} className="text-center p-2 text-xs font-medium">
                        {formatDateShort(day.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.grid.map((row) => (
                    <tr key={row.venue_id} className="border-b">
                      <td className="p-2 font-medium">{row.venue_name}</td>
                      {row.days.map((day) => (
                        <td key={day.date} className="text-center p-2">
                          <StatusCell day={day} venueId={row.venue_id} onOpenDrawer={openAttestationDrawer} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Queue */}
        {data.outstanding.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Attestations ({data.outstanding.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.outstanding.map((item) => (
                  <div
                    key={`${item.venue_id}-${item.business_date}`}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      item.state === 'late'
                        ? 'border-red-200 bg-red-50'
                        : 'border-yellow-200 bg-yellow-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.state === 'late' ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-600" />
                      )}
                      <div>
                        <div className="font-semibold">{item.venue_name}</div>
                        <div className="text-sm text-muted-foreground">{item.business_date}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={item.state === 'late' ? 'destructive' : 'secondary'}>
                        {item.state === 'late' ? 'LATE' : 'Due today'}
                      </Badge>
                      <Link href={`/reports/nightly?date=${item.business_date}&venue=${item.venue_id}`}>
                        <Button size="sm" variant="outline">
                          View Report
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rollups */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue Variance Reasons */}
          {data.rollups.revenue_reasons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Variance Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.rollups.revenue_reasons.map((item) => (
                    <div key={item.reason} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{item.reason.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Labor Variance Reasons */}
          {data.rollups.labor_reasons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Labor Variance Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.rollups.labor_reasons.map((item) => (
                    <div key={item.reason} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{item.reason.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comp Resolution Codes */}
          {data.rollups.comp_codes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Comp Resolution Codes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.rollups.comp_codes.map((item) => (
                    <div key={item.code} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{item.code.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Incidents */}
          {data.rollups.incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Incidents by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.rollups.incidents.map((item) => (
                    <div key={item.type} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{item.type.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{item.total} total</Badge>
                        {item.open > 0 && (
                          <Badge variant="destructive">{item.open} open</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Attestation Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {loadingDrawer ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : selectedAttestation?.error ? (
            <div className="p-6">
              <p className="text-red-600">{selectedAttestation.error}</p>
            </div>
          ) : selectedAttestation ? (
            <AttestationDrawerContent attestation={selectedAttestation} onClose={() => setDrawerOpen(false)} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function StatusCell({ day, venueId, onOpenDrawer }: {
  day: {
    date: string;
    state: 'submitted' | 'pending' | 'late' | 'not_applicable';
    attestation_id?: string;
    has_violations?: boolean;
    violation_count?: number;
  };
  venueId: string;
  onOpenDrawer: (attestationId: string, venueId: string, businessDate: string) => void;
}) {
  if (day.state === 'not_applicable') {
    return <span className="text-gray-300">—</span>;
  }

  const icon = day.state === 'submitted' ? (
    <CheckCircle2 className={`h-5 w-5 ${day.has_violations ? 'text-orange-500' : 'text-green-500'}`} />
  ) : day.state === 'late' ? (
    <XCircle className="h-5 w-5 text-red-500" />
  ) : (
    <Clock className="h-5 w-5 text-yellow-500" />
  );

  // If attestation exists (submitted or draft), open drawer
  // Otherwise, link to nightly report to create it
  if (day.attestation_id) {
    return (
      <button
        onClick={() => onOpenDrawer(day.attestation_id!, venueId, day.date)}
        className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity"
      >
        {icon}
        {day.has_violations && day.violation_count && (
          <Badge variant="destructive" className="text-xs">
            {day.violation_count}
          </Badge>
        )}
      </button>
    );
  }

  // No attestation yet - link to nightly report
  return (
    <Link href={`/reports/nightly?date=${day.date}&venue=${venueId}`}>
      <div className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70">
        {icon}
      </div>
    </Link>
  );
}

function AttestationDrawerContent({ attestation, onClose }: {
  attestation: any;
  onClose: () => void;
}) {
  const att = attestation.attestation;
  const compResolutions = attestation.comp_resolutions || [];
  const incidents = attestation.incidents || [];
  const coachingActions = attestation.coaching_actions || [];

  const statusColor =
    att.status === 'submitted' ? 'text-green-600' :
    att.status === 'amended' ? 'text-blue-600' :
    'text-yellow-600';

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle>Attestation Details</SheetTitle>
        <SheetDescription>
          {att.venue_name} · {att.business_date}
        </SheetDescription>
      </SheetHeader>

      {/* Status & Submission Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className={statusColor}>
              {att.status.toUpperCase()}
            </Badge>
          </div>
          {att.submitted_at && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Submitted</span>
                <span className="text-sm">{new Date(att.submitted_at).toLocaleString()}</span>
              </div>
              {att.submitted_by_user && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Submitted By</span>
                  <span className="text-sm flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {att.submitted_by_user.first_name} {att.submitted_by_user.last_name}
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Violations</span>
            <Badge variant={att.has_violations ? 'destructive' : 'secondary'}>
              {att.violation_count || 0}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Attestation */}
      {att.revenue_confirmed !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Attestation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Accuracy Confirmed</span>
              {att.revenue_confirmed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            {att.revenue_variance_reason && (
              <div>
                <span className="text-xs text-muted-foreground">Variance Reason:</span>
                <Badge variant="secondary" className="ml-2">
                  {att.revenue_variance_reason.replace(/_/g, ' ')}
                </Badge>
              </div>
            )}
            {att.revenue_notes && (
              <div className="pt-2 border-t">
                <span className="text-xs text-muted-foreground block mb-1">Notes:</span>
                <p className="text-sm">{att.revenue_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Labor Attestation */}
      {att.labor_confirmed !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Labor Attestation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Accuracy Confirmed</span>
              {att.labor_confirmed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            {att.labor_variance_reason && (
              <div>
                <span className="text-xs text-muted-foreground">Variance Reason:</span>
                <Badge variant="secondary" className="ml-2">
                  {att.labor_variance_reason.replace(/_/g, ' ')}
                </Badge>
              </div>
            )}
            {att.labor_notes && (
              <div className="pt-2 border-t">
                <span className="text-xs text-muted-foreground block mb-1">Notes:</span>
                <p className="text-sm">{att.labor_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comp Resolutions */}
      {compResolutions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Comp Resolutions ({compResolutions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {compResolutions.map((res: any) => (
                <div key={res.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm">Check {res.check_id || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{res.employee_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${res.comp_amount?.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        of ${res.check_amount?.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={res.is_policy_violation ? 'destructive' : 'secondary'}>
                      {res.resolution_code.replace(/_/g, ' ')}
                    </Badge>
                    {res.requires_follow_up && (
                      <Badge variant="outline">Follow-up required</Badge>
                    )}
                  </div>
                  {res.resolution_notes && (
                    <p className="text-xs text-muted-foreground">{res.resolution_notes}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Incidents */}
      {incidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Incidents ({incidents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {incidents.map((inc: any) => (
                <div key={inc.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={
                      inc.severity === 'critical' ? 'destructive' :
                      inc.severity === 'high' ? 'destructive' :
                      inc.severity === 'medium' ? 'secondary' :
                      'outline'
                    }>
                      {inc.incident_type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground uppercase">
                      {inc.severity}
                    </span>
                  </div>
                  <p className="text-sm">{inc.description}</p>
                  {inc.resolution && (
                    <div className="pt-2 border-t">
                      <span className="text-xs text-muted-foreground block mb-1">Resolution:</span>
                      <p className="text-sm">{inc.resolution}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {inc.resolved ? (
                      <Badge variant="secondary" className="text-xs">Resolved</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Open</Badge>
                    )}
                    {inc.requires_escalation && (
                      <Badge variant="destructive" className="text-xs">Escalation Required</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coaching Actions */}
      {coachingActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coaching Actions ({coachingActions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {coachingActions.map((coaching: any) => (
                <div key={coaching.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{coaching.employee_name}</div>
                    <Badge variant={
                      coaching.coaching_type === 'recognition' ? 'secondary' :
                      coaching.coaching_type === 'correction' ? 'destructive' :
                      'outline'
                    }>
                      {coaching.coaching_type}
                    </Badge>
                  </div>
                  <p className="text-sm">{coaching.reason}</p>
                  {coaching.action_taken && (
                    <p className="text-xs text-muted-foreground">Action: {coaching.action_taken}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <Link
          href={`/reports/nightly?date=${attestation.business_date}&venue=${attestation.venue_id}`}
          className="flex-1"
        >
          <Button variant="outline" className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Report
          </Button>
        </Link>
        <Button onClick={onClose} className="flex-1">
          Close
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}
