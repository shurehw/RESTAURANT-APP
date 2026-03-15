/**
 * Oversight — Consolidated director view
 *
 * Single page merging Venue Health, Attestation Compliance,
 * and Manager Intelligence into one accountability dashboard.
 *
 * The rules are always on. The rails are fixed.
 * Calibration is allowed. Escape is not.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  Loader2,
  Minus,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  User,
  UserX,
  Users,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────

// Health
interface HealthDriver {
  signal: string;
  risk: number;
  weight: number;
  impact: number;
  reason: string;
}

interface DailyEntry {
  date: string;
  score: number;
  status: string;
  confidence: number;
  signal_count: number;
  drivers: HealthDriver[] | null;
}

interface VenueSummary {
  venue_id: string;
  venue_name: string;
  avg_score: number;
  status: string;
  days_count: number;
  latest_score: number;
  latest_drivers: HealthDriver[] | null;
  worst_day: { date: string; score: number; status: string };
  daily: DailyEntry[];
}

interface HealthData {
  view: string;
  date: string;
  start_date: string;
  end_date: string;
  period_label: string;
  portfolio: {
    venue_count: number;
    avg_score: number;
    status_counts: Record<string, number>;
  };
  venues: VenueSummary[];
}

// Attestation
interface AttestationData {
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
    attestation_id?: string;
  }>;
  rollups: {
    policy_violations: { count: number };
  };
}

// Intelligence
interface ManagerComparison {
  manager_id: string;
  manager_name: string | null;
  total_attestations: number;
  avg_signals_per_night: number;
  commitments_made: number;
  follow_through_rate: number;
  avg_command_score: number | null;
  avoidance_rate: number;
  top_concern: string | null;
}

interface IntelligenceItem {
  id: string;
  intelligence_type: string;
  severity: string;
  title: string;
  description: string;
  subject_manager_name: string | null;
  status: string;
}

interface ManagerProfile {
  manager_id: string;
  manager_name: string | null;
  manager_email: string;
  total_attestations: number;
  total_signals: number;
  avg_signals_per_attestation: number;
  employee_mentions: number;
  action_commitments: number;
  operational_issues: number;
  guest_insights: number;
  staffing_signals: number;
  commitments_made: number;
  commitments_fulfilled: number;
  commitments_unfulfilled: number;
  commitments_open: number;
  follow_through_rate: number;
  unique_employees_mentioned: number;
  most_mentioned_employees: Array<{
    name: string;
    count: number;
    positive: number;
    negative: number;
    actionable: number;
  }>;
  positive_mentions: number;
  negative_mentions: number;
  actionable_mentions: number;
  neutral_mentions: number;
  avg_ownership: {
    narrative_depth: number;
    ownership: number;
    variance_awareness: number;
    signal_density: number;
    command_tone: number;
    energy_alignment: number;
    overall_command_score: number;
  } | null;
  ownership_trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  avoidance_rate: number;
  blame_shift_rate: number;
  corrective_action_rate: number;
  first_attestation: string;
  last_attestation: string;
}

// ── Styles ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; border: string; ring: string }> = {
  GREEN:  { dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-200' },
  YELLOW: { dot: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   ring: 'ring-amber-200' },
  ORANGE: { dot: 'bg-orange-500',  bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  ring: 'ring-orange-200' },
  RED:    { dot: 'bg-red-500',     bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     ring: 'ring-red-200' },
};

// ── Page ──────────────────────────────────────────────────────────────────

export default function OversightPage() {
  const supabase = useMemo(() => createClient(), []);

  // State
  const [orgId, setOrgId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [daysBack, setDaysBack] = useState(7);

  const startDate = useMemo(() => {
    const d = new Date(date);
    d.setDate(d.getDate() - (daysBack - 1));
    return d.toISOString().split('T')[0];
  }, [date, daysBack]);

  // Data
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [attestationData, setAttestationData] = useState<AttestationData | null>(null);
  const [managers, setManagers] = useState<ManagerComparison[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceItem[]>([]);
  const [reliabilityScores, setReliabilityScores] = useState<Map<string, number>>(new Map());

  // Drill-downs
  const [selectedManager, setSelectedManager] = useState<ManagerProfile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAttestation, setSelectedAttestation] = useState<any>(null);
  const [loadingDrawer, setLoadingDrawer] = useState(false);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    };
  }, [supabase]);

  // Bootstrap: get org + venues
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgUser } = await supabase
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (orgUser) {
        setOrgId(orgUser.organization_id);

        const { data: v } = await supabase
          .from('venues')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        setVenues(v || []);
      }
    }
    init();
  }, [supabase]);

  // Fetch all data in parallel
  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();

      // Build params
      const healthParams = new URLSearchParams({ view: 'daily', date });
      const attestParams = new URLSearchParams({ start_date: startDate, end_date: date });

      const intelParams = new URLSearchParams({ org_id: orgId });
      if (venueId) intelParams.set('venue_id', venueId);

      const compareParams = new URLSearchParams({ org_id: orgId, mode: 'compare', days: '90' });
      if (venueId) compareParams.set('venue_id', venueId);

      const scoresParams = new URLSearchParams({
        org_id: orgId,
        entity_type: 'manager',
        days: '7',
      });

      const [healthRes, attestRes, intelRes, compRes, scoresRes] = await Promise.all([
        fetch(`/api/health?${healthParams}`, { headers, credentials: 'include' }),
        fetch(`/api/attestations/dashboard?${attestParams}`, { headers, credentials: 'include' }),
        fetch(`/api/operator/intelligence?${intelParams}`, { headers }),
        venueId
          ? fetch(`/api/attestation/signals/analytics?${compareParams}`, { headers })
          : Promise.resolve(null),
        fetch(`/api/enforcement/scores?${scoresParams}`, { headers }).catch(() => null),
      ]);

      if (healthRes.ok) setHealthData(await healthRes.json());
      if (attestRes.ok) setAttestationData(await attestRes.json());
      if (intelRes.ok) {
        const d = await intelRes.json();
        setIntelligence(d.items || []);
      }
      if (compRes && compRes.ok) {
        const d = await compRes.json();
        setManagers(d.managers || []);
      }
      if (scoresRes && scoresRes.ok) {
        const d = await scoresRes.json();
        const scoreMap = new Map<string, number>();
        for (const s of d.scores || []) scoreMap.set(s.entity_id, s.latest_score);
        setReliabilityScores(scoreMap);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load oversight data');
    } finally {
      setLoading(false);
    }
  }, [orgId, venueId, date, startDate, getAuthHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Intelligence action handler
  async function handleIntelAction(id: string, action: 'resolve' | 'dismiss') {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/operator/intelligence', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, action, org_id: orgId }),
    });
    if (res.ok) setIntelligence(prev => prev.filter(i => i.id !== id));
  }

  // Attestation drawer
  async function openAttestationDrawer(attestationId: string, venueId: string, businessDate: string) {
    setDrawerOpen(true);
    setLoadingDrawer(true);
    setSelectedAttestation(null);
    try {
      const res = await fetch(`/api/attestations/${attestationId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch attestation');
      const { data } = await res.json();
      setSelectedAttestation({ ...data, venue_id: venueId, business_date: businessDate });
    } catch (err: any) {
      setSelectedAttestation({ error: err.message });
    } finally {
      setLoadingDrawer(false);
    }
  }

  // Manager profile
  async function loadManagerProfile(managerId: string) {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ org_id: orgId!, mode: 'profile', manager_id: managerId, days: '90' });
    if (venueId) params.set('venue_id', venueId);
    const res = await fetch(`/api/attestation/signals/analytics?${params}`, { headers });
    if (res.ok) {
      const d = await res.json();
      setSelectedManager(d.profile);
    }
  }

  // Date nav
  const shiftDate = (days: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading && !healthData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !healthData && !attestationData) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-brass" />
          <div>
            <h1 className="text-2xl font-bold">Oversight</h1>
            <p className="text-sm text-muted-foreground">
              Venue health, compliance, and manager accountability
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Venue filter */}
          {venues.length > 1 && (
            <select
              value={venueId || ''}
              onChange={(e) => {
                setVenueId(e.target.value || null);
                setSelectedManager(null);
              }}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="">All Venues</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}

          {/* Date range */}
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="px-3 py-2 border rounded-md text-sm bg-background"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>

          {/* Date nav */}
          <div className="flex items-center gap-1">
            <button onClick={() => shiftDate(-1)} className="p-2 rounded border hover:bg-accent">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded border text-sm bg-background"
            />
            <button onClick={() => shiftDate(1)} className="p-2 rounded border hover:bg-accent">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Avg Health"
          value={healthData ? Math.round(healthData.portfolio.avg_score) : '—'}
          icon={<Activity className="h-8 w-8 text-emerald-600" />}
          variant={
            !healthData ? 'neutral'
              : healthData.portfolio.avg_score >= 80 ? 'success'
              : healthData.portfolio.avg_score >= 65 ? 'warning'
              : 'critical'
          }
          sub={healthData ? `${healthData.portfolio.venue_count} venues` : undefined}
        />
        <SummaryCard
          label="Compliance"
          value={attestationData ? `${attestationData.compliance.pct}%` : '—'}
          icon={<CheckCircle2 className="h-8 w-8 text-green-600" />}
          variant={
            !attestationData ? 'neutral'
              : attestationData.compliance.pct >= 90 ? 'success'
              : attestationData.compliance.pct >= 70 ? 'warning'
              : 'critical'
          }
          sub={attestationData ? `${attestationData.compliance.submitted}/${attestationData.compliance.expected}` : undefined}
        />
        <SummaryCard
          label="Active Alerts"
          value={intelligence.length}
          icon={<AlertTriangle className="h-8 w-8 text-yellow-600" />}
          variant={intelligence.length === 0 ? 'success' : intelligence.length <= 3 ? 'warning' : 'critical'}
          sub={intelligence.filter(i => i.severity === 'critical').length > 0
            ? `${intelligence.filter(i => i.severity === 'critical').length} critical`
            : 'none critical'}
        />
        <SummaryCard
          label="Policy Violations"
          value={attestationData?.rollups.policy_violations.count ?? '—'}
          icon={<ShieldAlert className="h-8 w-8 text-orange-600" />}
          variant={
            !attestationData ? 'neutral'
              : attestationData.rollups.policy_violations.count === 0 ? 'success'
              : attestationData.rollups.policy_violations.count <= 3 ? 'warning'
              : 'critical'
          }
          sub={`last ${daysBack} days`}
        />
      </div>

      {/* ── Manager Profile Drill-Down ─────────────────────────────────── */}
      {selectedManager ? (
        <ManagerProfileView
          profile={selectedManager}
          onBack={() => setSelectedManager(null)}
        />
      ) : (
        <>
          {/* ── Active Intelligence ────────────────────────────────────── */}
          {intelligence.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Active Intelligence ({intelligence.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {intelligence.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-start justify-between gap-3 p-3 rounded-md border ${
                        item.severity === 'critical'
                          ? 'border-l-4 border-l-red-500 bg-red-50/50'
                          : item.severity === 'warning'
                            ? 'border-l-4 border-l-yellow-500 bg-yellow-50/50'
                            : 'border-l-4 border-l-blue-500 bg-blue-50/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.intelligence_type === 'unfulfilled_commitment' && (
                            <Clock className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                          )}
                          {item.intelligence_type === 'employee_pattern' && (
                            <UserX className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          )}
                          {item.intelligence_type === 'ownership_alert' && (
                            <ShieldAlert className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                          )}
                          <span className="text-sm font-medium">{item.title}</span>
                          {item.subject_manager_name && (
                            <Badge variant="outline" className="text-[10px]">
                              {item.subject_manager_name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleIntelAction(item.id, 'resolve')}
                          className="p-1 rounded hover:bg-emerald-100 text-emerald-600"
                          title="Resolve"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleIntelAction(item.id, 'dismiss')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Dismiss"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Venue Health Grid ──────────────────────────────────────── */}
          {healthData && healthData.venues.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  Venue Health
                  <div className="flex items-center gap-2 ml-auto">
                    {(['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const).map(status => {
                      const count = healthData.portfolio.status_counts[status];
                      if (!count) return null;
                      const s = STATUS_STYLES[status];
                      return (
                        <span key={status} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
                          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                          {count}
                        </span>
                      );
                    })}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...healthData.venues]
                    .sort((a, b) => a.latest_score - b.latest_score)
                    .map(venue => {
                      const s = STATUS_STYLES[venue.status] || STATUS_STYLES.GREEN;
                      const drivers = venue.latest_drivers || [];
                      // Find attestation status for this venue
                      const attRow = attestationData?.grid.find(g => g.venue_id === venue.venue_id);
                      const latestDay = attRow?.days[attRow.days.length - 1];

                      return (
                        <div key={venue.venue_id} className={`rounded-lg border p-4 ${s.border}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">{venue.venue_name}</h3>
                            <div className="flex items-center gap-2">
                              {/* Attestation status inline */}
                              {latestDay && latestDay.state !== 'not_applicable' && (
                                <span title={`Attestation: ${latestDay.state}`}>
                                  {latestDay.state === 'submitted' ? (
                                    <CheckCircle2 className={`h-4 w-4 ${latestDay.has_violations ? 'text-orange-500' : 'text-green-500'}`} />
                                  ) : latestDay.state === 'late' ? (
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  ) : (
                                    <Clock className="h-4 w-4 text-yellow-500" />
                                  )}
                                </span>
                              )}
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-bold ${s.bg} ${s.text}`}>
                                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                                {Math.round(venue.latest_score)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {drivers.map(d => (
                              <SignalPill key={d.signal} signal={d.signal} risk={d.risk} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Compliance Grid ────────────────────────────────────────── */}
          {attestationData && attestationData.grid.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Attestation Compliance
                  {attestationData.outstanding.length > 0 && (
                    <Badge variant="error" className="ml-2">
                      {attestationData.outstanding.length} outstanding
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-semibold">Venue</th>
                        {attestationData.grid[0]?.days.map((day) => (
                          <th key={day.date} className="text-center p-2 text-xs font-medium">
                            {formatDateShort(day.date)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attestationData.grid.map((row) => (
                        <tr key={row.venue_id} className="border-b last:border-0">
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
          )}

          {/* ── Manager Comparison ─────────────────────────────────────── */}
          {managers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Manager Comparison (90-day)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium">Manager</th>
                        <th className="pb-2 pr-4 font-medium text-center">Reliability</th>
                        <th className="pb-2 pr-4 font-medium text-center">Nights</th>
                        <th className="pb-2 pr-4 font-medium text-center">Command</th>
                        <th className="pb-2 pr-4 font-medium text-center">Follow-Through</th>
                        <th className="pb-2 pr-4 font-medium text-center">Avoidance</th>
                        <th className="pb-2 pr-4 font-medium text-center">Signals/Night</th>
                        <th className="pb-2 pr-4 font-medium text-center">Concern</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managers.map(mgr => (
                        <tr
                          key={mgr.manager_id}
                          className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                          onClick={() => loadManagerProfile(mgr.manager_id)}
                        >
                          <td className="py-3 pr-4 font-medium">{mgr.manager_name || 'Unknown'}</td>
                          <td className="py-3 pr-4 text-center">
                            <ReliabilityBadge score={reliabilityScores.get(mgr.manager_id)} />
                          </td>
                          <td className="py-3 pr-4 text-center text-muted-foreground">{mgr.total_attestations}</td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.avg_command_score != null ? (
                              <CommandScoreBadge score={mgr.avg_command_score} />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.commitments_made > 0 ? (
                              <span className={mgr.follow_through_rate >= 0.7 ? 'text-green-600' : mgr.follow_through_rate >= 0.4 ? 'text-yellow-600' : 'text-red-600'}>
                                {Math.round(mgr.follow_through_rate * 100)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.avoidance_rate > 0 ? (
                              <span className={mgr.avoidance_rate >= 0.3 ? 'text-red-600' : 'text-yellow-600'}>
                                {Math.round(mgr.avoidance_rate * 100)}%
                              </span>
                            ) : (
                              <span className="text-green-600">0%</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center text-muted-foreground">
                            {mgr.avg_signals_per_night.toFixed(1)}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.top_concern ? (
                              <Badge variant="error" className="text-[10px]">{mgr.top_concern}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {!venueId && managers.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Select a venue to see manager comparison data
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Attestation Detail Drawer ──────────────────────────────────── */}
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

// ── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  variant,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  variant: 'success' | 'warning' | 'critical' | 'neutral';
  sub?: string;
}) {
  const borderColor =
    variant === 'success' ? 'border-emerald-200'
    : variant === 'warning' ? 'border-amber-200'
    : variant === 'critical' ? 'border-red-200'
    : 'border-border';

  return (
    <Card className={borderColor}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-bold">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Signal Pill ───────────────────────────────────────────────────────────

function SignalPill({ signal, risk }: { signal: string; risk: number }) {
  const color = risk < 0.3
    ? 'bg-emerald-50 text-emerald-700'
    : risk < 0.6
    ? 'bg-amber-50 text-amber-700'
    : 'bg-red-50 text-red-700';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {signal.charAt(0).toUpperCase() + signal.slice(1)}
    </span>
  );
}

// ── Status Cell (Attestation Grid) ────────────────────────────────────────

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

  if (day.attestation_id) {
    return (
      <button
        onClick={() => onOpenDrawer(day.attestation_id!, venueId, day.date)}
        className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity"
      >
        {icon}
        {day.has_violations && day.violation_count ? (
          <Badge variant="error" className="text-xs">{day.violation_count}</Badge>
        ) : null}
      </button>
    );
  }

  return (
    <Link href={`/reports/nightly?date=${day.date}&venue=${venueId}`}>
      <div className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70">{icon}</div>
    </Link>
  );
}

// ── Attestation Drawer Content ────────────────────────────────────────────

function AttestationDrawerContent({ attestation, onClose }: { attestation: any; onClose: () => void }) {
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
        <SheetDescription>{att.venue_name} · {att.business_date}</SheetDescription>
      </SheetHeader>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className={statusColor}>{att.status.toUpperCase()}</Badge>
          </div>
          {att.submitted_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Submitted</span>
              <span className="text-sm">{new Date(att.submitted_at).toLocaleString()}</span>
            </div>
          )}
          {att.submitted_by_user && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">By</span>
              <span className="text-sm flex items-center gap-1">
                <User className="h-3 w-3" />
                {att.submitted_by_user.first_name} {att.submitted_by_user.last_name}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Violations</span>
            <Badge variant={att.has_violations ? 'error' : 'default'}>{att.violation_count || 0}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Revenue */}
      {att.revenue_confirmed !== null && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Confirmed</span>
              {att.revenue_confirmed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            </div>
            {att.revenue_variance_reason && (
              <Badge variant="default">{att.revenue_variance_reason.replace(/_/g, ' ')}</Badge>
            )}
            {att.revenue_notes && <p className="text-xs text-muted-foreground">{att.revenue_notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Labor */}
      {att.labor_confirmed !== null && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Labor</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Confirmed</span>
              {att.labor_confirmed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            </div>
            {att.labor_variance_reason && (
              <Badge variant="default">{att.labor_variance_reason.replace(/_/g, ' ')}</Badge>
            )}
            {att.labor_notes && <p className="text-xs text-muted-foreground">{att.labor_notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Comps */}
      {compResolutions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Comps ({compResolutions.length})</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {compResolutions.map((res: any) => (
              <div key={res.id} className="p-2 border rounded space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{res.employee_name} · Check {res.check_id || 'N/A'}</span>
                  <span className="text-xs font-semibold">${res.comp_amount?.toFixed(2)}</span>
                </div>
                <Badge variant={res.is_policy_violation ? 'error' : 'default'} className="text-[10px]">
                  {res.resolution_code.replace(/_/g, ' ')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Incidents */}
      {incidents.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Incidents ({incidents.length})</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {incidents.map((inc: any) => (
              <div key={inc.id} className="p-2 border rounded space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant={inc.severity === 'critical' || inc.severity === 'high' ? 'error' : 'default'} className="text-[10px]">
                    {inc.incident_type.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-[10px] uppercase text-muted-foreground">{inc.severity}</span>
                </div>
                <p className="text-xs">{inc.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Coaching */}
      {coachingActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Coaching ({coachingActions.length})</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {coachingActions.map((c: any) => (
              <div key={c.id} className="p-2 border rounded space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{c.employee_name}</span>
                  <Badge variant={c.coaching_type === 'correction' ? 'error' : 'default'} className="text-[10px]">
                    {c.coaching_type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{c.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 pt-4 border-t">
        <Link href={`/reports/nightly?date=${attestation.business_date}&venue=${attestation.venue_id}`} className="flex-1">
          <Button variant="outline" className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />View Report
          </Button>
        </Link>
        <Button onClick={onClose} className="flex-1">Close</Button>
      </div>
    </div>
  );
}

// ── Manager Profile View ──────────────────────────────────────────────────

function ManagerProfileView({ profile, onBack }: { profile: ManagerProfile; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to overview
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-brass/20 text-brass flex items-center justify-center text-lg font-bold">
          {(profile.manager_name || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-bold">{profile.manager_name || 'Unknown Manager'}</h2>
          <p className="text-sm text-muted-foreground">
            {profile.total_attestations} attestations · {profile.first_attestation} to {profile.last_attestation}
          </p>
        </div>
        {profile.ownership_trend !== 'insufficient_data' && (
          <div className="ml-auto flex items-center gap-1 text-sm">
            {profile.ownership_trend === 'improving' && (
              <><TrendingUp className="h-4 w-4 text-green-600" /><span className="text-green-600">Improving</span></>
            )}
            {profile.ownership_trend === 'declining' && (
              <><TrendingDown className="h-4 w-4 text-red-600" /><span className="text-red-600">Declining</span></>
            )}
            {profile.ownership_trend === 'stable' && (
              <><Minus className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Stable</span></>
            )}
          </div>
        )}
      </div>

      {/* Ownership Scorecard */}
      {profile.avg_ownership && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Ownership Scorecard</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ScoreCell label="Command Score" value={profile.avg_ownership.overall_command_score} max={10} />
              <ScoreCell label="Narrative Depth" value={profile.avg_ownership.narrative_depth} max={10} />
              <ScoreCell label="Ownership" value={profile.avg_ownership.ownership} max={10} />
              <ScoreCell label="Variance Awareness" value={profile.avg_ownership.variance_awareness} max={10} />
              <ScoreCell label="Signal Density" value={profile.avg_ownership.signal_density} max={10} />
              <ScoreCell label="Command Tone" value={profile.avg_ownership.command_tone} max={10} />
              <ScoreCell label="Energy Alignment" value={profile.avg_ownership.energy_alignment} max={10} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Behavior Flags */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlagCard label="Follow-Through" value={`${Math.round(profile.follow_through_rate * 100)}%`} good={profile.follow_through_rate >= 0.7} detail={`${profile.commitments_fulfilled} of ${profile.commitments_fulfilled + profile.commitments_unfulfilled} closed`} />
        <FlagCard label="Avoidance Rate" value={`${Math.round(profile.avoidance_rate * 100)}%`} good={profile.avoidance_rate < 0.15} detail="Vague/avoidant language" />
        <FlagCard label="Blame Shifting" value={`${Math.round(profile.blame_shift_rate * 100)}%`} good={profile.blame_shift_rate < 0.15} detail="External attribution" />
        <FlagCard label="Corrective Action" value={`${Math.round(profile.corrective_action_rate * 100)}%`} good={profile.corrective_action_rate >= 0.5} detail="Real-time corrections" />
      </div>

      {/* Signal Breakdown */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Signal Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div><div className="text-2xl font-bold">{profile.total_signals}</div><div className="text-xs text-muted-foreground">Total</div></div>
            <div><div className="text-2xl font-bold">{profile.employee_mentions}</div><div className="text-xs text-muted-foreground">Employees</div></div>
            <div><div className="text-2xl font-bold">{profile.action_commitments}</div><div className="text-xs text-muted-foreground">Commitments</div></div>
            <div><div className="text-2xl font-bold">{profile.operational_issues}</div><div className="text-xs text-muted-foreground">Ops Issues</div></div>
            <div><div className="text-2xl font-bold">{profile.guest_insights}</div><div className="text-xs text-muted-foreground">Guest</div></div>
            <div><div className="text-2xl font-bold">{profile.staffing_signals}</div><div className="text-xs text-muted-foreground">Staffing</div></div>
          </div>
        </CardContent>
      </Card>

      {/* Employee Mentions */}
      {profile.most_mentioned_employees.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Employee Mentions ({profile.unique_employees_mentioned})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium text-center">Total</th>
                    <th className="pb-2 pr-4 font-medium text-center">+</th>
                    <th className="pb-2 pr-4 font-medium text-center">-</th>
                    <th className="pb-2 pr-4 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.most_mentioned_employees.map(emp => (
                    <tr key={emp.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 capitalize">{emp.name}</td>
                      <td className="py-2 pr-4 text-center">{emp.count}</td>
                      <td className="py-2 pr-4 text-center text-green-600">{emp.positive}</td>
                      <td className="py-2 pr-4 text-center text-red-600">{emp.negative}</td>
                      <td className="py-2 pr-4 text-center text-yellow-600">{emp.actionable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commitment Tracking */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Commitments</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div><div className="text-2xl font-bold">{profile.commitments_made}</div><div className="text-xs text-muted-foreground">Made</div></div>
            <div><div className="text-2xl font-bold text-green-600">{profile.commitments_fulfilled}</div><div className="text-xs text-muted-foreground">Fulfilled</div></div>
            <div><div className="text-2xl font-bold text-red-600">{profile.commitments_unfulfilled}</div><div className="text-xs text-muted-foreground">Unfulfilled</div></div>
            <div><div className="text-2xl font-bold text-yellow-600">{profile.commitments_open}</div><div className="text-xs text-muted-foreground">Open</div></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────────────────

function ScoreCell({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FlagCard({ label, value, good, detail }: { label: string; value: string; good: boolean; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className={`text-2xl font-bold ${good ? 'text-green-600' : 'text-red-600'}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground mt-1">{detail}</div>
      </CardContent>
    </Card>
  );
}

function CommandScoreBadge({ score }: { score: number }) {
  const color = score >= 7
    ? 'bg-green-100 text-green-700 border-green-200'
    : score >= 4
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function ReliabilityBadge({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-muted-foreground text-xs">-</span>;
  const color = score >= 70
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : score >= 40
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {score}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}
