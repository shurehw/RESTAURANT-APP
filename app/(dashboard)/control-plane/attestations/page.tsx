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
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Loader2,
  Calendar,
  TrendingUp,
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
                          <StatusCell day={day} venueId={row.venue_id} />
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function StatusCell({ day, venueId }: {
  day: {
    date: string;
    state: 'submitted' | 'pending' | 'late' | 'not_applicable';
    attestation_id?: string;
    has_violations?: boolean;
    violation_count?: number;
  };
  venueId: string;
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

  return (
    <Link href={`/reports/nightly?date=${day.date}&venue=${venueId}`}>
      <div className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70">
        {icon}
        {day.has_violations && day.violation_count && (
          <Badge variant="destructive" className="text-xs">
            {day.violation_count}
          </Badge>
        )}
      </div>
    </Link>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}
