'use client';

/**
 * Enforcement Scorecard — Home Page
 *
 * Lightweight client component that loads pre-computed rollup data.
 * Skeleton → async fetch → full scorecard in <2s.
 */

import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

interface TopRiskVenue {
  venue_id: string;
  venue_name: string;
  risk_score: number;
  missed_attestation: boolean;
  critical_items: number;
  carry_forward: number;
  labor_exceptions: number;
}

interface PortfolioRollup {
  attestation_expected: number;
  attestation_submitted: number;
  attestation_late: number;
  attestation_missed: number;
  attestation_compliance_pct: number;
  carry_forward_count: number;
  critical_open_count: number;
  escalated_count: number;
  comp_exception_count: number;
  labor_exception_count: number;
  procurement_exception_count: number;
  revenue_variance_count: number;
  total_net_revenue: number;
  total_covers: number;
  avg_check: number;
  total_labor_cost: number;
  labor_pct: number;
  top_venues_json: TopRiskVenue[] | null;
  computed_at: string;
}

interface VenueRollup {
  venue_id: string;
  venue_name: string;
  rollup_date: string;
  attestation_compliance_pct: number;
  attestation_missed: number;
  carry_forward_count: number;
  critical_open_count: number;
  escalated_count: number;
  comp_exception_count: number;
  labor_exception_count: number;
  total_net_revenue: number;
  total_covers: number;
  avg_check: number;
  labor_pct: number;
}

interface RollupResponse {
  date: string;
  portfolio: PortfolioRollup | null;
  venues: VenueRollup[];
  has_data: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export function EnforcementScorecard() {
  const [data, setData] = useState<RollupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/portfolio/rollup');
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <ScorecardSkeleton />;
  if (error) return <ScorecardError message={error} />;
  if (!data?.has_data) return <ScorecardEmpty />;

  const p = data.portfolio!;
  const totalExceptions =
    p.comp_exception_count +
    p.labor_exception_count +
    p.procurement_exception_count +
    p.revenue_variance_count;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-opsos-brass-600" />
            Portfolio Enforcement Scorecard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(data.date)} &middot; Updated{' '}
            {formatRelativeTime(p.computed_at)}
          </p>
        </div>
      </div>

      {/* Hero Metrics — 4 gauges */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Attestation Compliance"
          value={`${p.attestation_compliance_pct}%`}
          subtitle={`${p.attestation_submitted}/${p.attestation_expected} submitted`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          status={
            p.attestation_compliance_pct >= 90
              ? 'success'
              : p.attestation_compliance_pct >= 70
                ? 'warning'
                : 'critical'
          }
          detail={
            p.attestation_missed > 0
              ? `${p.attestation_missed} missed`
              : p.attestation_late > 0
                ? `${p.attestation_late} late`
                : 'All on time'
          }
        />

        <MetricCard
          title="Open Enforcement Items"
          value={String(p.carry_forward_count)}
          subtitle={`${p.critical_open_count} critical, ${p.escalated_count} escalated`}
          icon={<AlertTriangle className="w-5 h-5" />}
          status={
            p.critical_open_count === 0 && p.escalated_count === 0
              ? 'success'
              : p.critical_open_count > 0
                ? 'critical'
                : 'warning'
          }
          detail={
            p.carry_forward_count === 0
              ? 'Clear'
              : `${p.carry_forward_count} carry-forward`
          }
        />

        <MetricCard
          title="Exceptions Detected"
          value={String(totalExceptions)}
          subtitle="Across all domains"
          icon={<XCircle className="w-5 h-5" />}
          status={
            totalExceptions === 0
              ? 'success'
              : totalExceptions <= 5
                ? 'warning'
                : 'critical'
          }
          detail={[
            p.comp_exception_count > 0 && `${p.comp_exception_count} comp`,
            p.labor_exception_count > 0 && `${p.labor_exception_count} labor`,
            p.procurement_exception_count > 0 &&
              `${p.procurement_exception_count} procurement`,
            p.revenue_variance_count > 0 &&
              `${p.revenue_variance_count} revenue`,
          ]
            .filter(Boolean)
            .join(', ') || 'None'}
        />

        <MetricCard
          title="Net Revenue"
          value={formatCurrency(p.total_net_revenue)}
          subtitle={`${p.total_covers.toLocaleString()} covers`}
          icon={<DollarSign className="w-5 h-5" />}
          status="neutral"
          detail={`Avg check ${formatCurrency(p.avg_check)} | Labor ${p.labor_pct}%`}
        />
      </div>

      {/* Top Risk Venues */}
      {p.top_venues_json && p.top_venues_json.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Top Risk Venues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {p.top_venues_json.slice(0, 5).map((v) => (
                <div
                  key={v.venue_id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <RiskBadge score={v.risk_score} />
                    <span className="font-medium text-sm">{v.venue_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {v.missed_attestation && (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <Clock className="w-3 h-3" /> Missed attestation
                      </span>
                    )}
                    {v.critical_items > 0 && (
                      <span className="text-amber-600">
                        {v.critical_items} critical
                      </span>
                    )}
                    {v.labor_exceptions > 0 && (
                      <span className="text-orange-600">
                        {v.labor_exceptions} labor exc.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Venue Breakdown Table */}
      {data.venues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-opsos-sage-600" />
              Venue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      Venue
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      Attestation
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      Open Items
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      Exceptions
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">
                      Revenue
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">
                      Labor %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.venues.map((v) => {
                    const vExc =
                      v.comp_exception_count + v.labor_exception_count;
                    return (
                      <tr
                        key={v.venue_id}
                        className="border-b border-gray-100 hover:bg-gray-50/50"
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {v.venue_name}
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <CompliancePill pct={v.attestation_compliance_pct} />
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span
                            className={
                              v.carry_forward_count > 0
                                ? 'text-amber-600 font-medium'
                                : 'text-gray-400'
                            }
                          >
                            {v.carry_forward_count}
                            {v.critical_open_count > 0 && (
                              <span className="text-red-600 text-xs ml-1">
                                ({v.critical_open_count} crit)
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span
                            className={
                              vExc > 0
                                ? 'text-orange-600 font-medium'
                                : 'text-gray-400'
                            }
                          >
                            {vExc}
                          </span>
                        </td>
                        <td className="text-right px-4 py-2.5 font-mono text-gray-700">
                          {formatCurrency(v.total_net_revenue)}
                        </td>
                        <td className="text-right px-4 py-2.5">
                          <span
                            className={
                              v.labor_pct > 30
                                ? 'text-red-600 font-medium'
                                : v.labor_pct > 25
                                  ? 'text-amber-600'
                                  : 'text-gray-700'
                            }
                          >
                            {v.labor_pct > 0 ? `${v.labor_pct}%` : '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Navigation */}
      <div className="grid gap-3 md:grid-cols-3">
        <QuickLink
          href="/reports/nightly"
          label="Nightly Report"
          description="Full operational detail"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <QuickLink
          href="/"
          label="Action Center"
          description="Open enforcement items"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <QuickLink
          href="/control-plane/attestations"
          label="Attestations"
          description="Manager compliance"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  status,
  detail,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  status: 'success' | 'warning' | 'critical' | 'neutral';
  detail: string;
}) {
  const statusColors = {
    success: 'border-l-emerald-500 bg-emerald-50/30',
    warning: 'border-l-amber-500 bg-amber-50/30',
    critical: 'border-l-red-500 bg-red-50/30',
    neutral: 'border-l-opsos-brass-400 bg-white',
  };

  const iconColors = {
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    critical: 'text-red-600',
    neutral: 'text-opsos-brass-600',
  };

  return (
    <Card className={`border-l-4 ${statusColors[status]}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {title}
          </span>
          <span className={iconColors[status]}>{icon}</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
        <div className="text-xs text-gray-400 mt-2">{detail}</div>
      </CardContent>
    </Card>
  );
}

function RiskBadge({ score }: { score: number }) {
  const bg =
    score >= 15
      ? 'bg-red-100 text-red-700'
      : score >= 8
        ? 'bg-amber-100 text-amber-700'
        : 'bg-yellow-50 text-yellow-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bg}`}>
      {score}
    </span>
  );
}

function CompliancePill({ pct }: { pct: number }) {
  const bg =
    pct >= 90
      ? 'bg-emerald-100 text-emerald-700'
      : pct >= 70
        ? 'bg-amber-100 text-amber-700'
        : pct > 0
          ? 'bg-red-100 text-red-700'
          : 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bg}`}>
      {pct > 0 ? `${pct}%` : '-'}
    </span>
  );
}

function QuickLink({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-4 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-opsos-brass-300 transition-colors group"
    >
      <span className="text-opsos-sage-600 group-hover:text-opsos-brass-600 transition-colors">
        {icon}
      </span>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-opsos-brass-500 transition-colors" />
    </Link>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SKELETON & EMPTY STATES
// ══════════════════════════════════════════════════════════════════════════

function ScorecardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-80" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-md border border-gray-200" />
        ))}
      </div>
      <div className="h-64 bg-gray-100 rounded-md border border-gray-200" />
    </div>
  );
}

function ScorecardError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
      <h2 className="text-lg font-semibold text-gray-700 mb-2">
        Unable to load scorecard
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {message === '401' ? 'Please log in again.' : `Error: ${message}`}
      </p>
      <Link
        href="/reports/nightly"
        className="text-sm text-opsos-brass-600 hover:underline"
      >
        Go to Nightly Report instead
      </Link>
    </div>
  );
}

function ScorecardEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldCheck className="w-12 h-12 text-opsos-sage-400 mb-4" />
      <h2 className="text-lg font-semibold text-gray-700 mb-2">
        No enforcement data yet
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Rollups are computed nightly after data syncs complete. Check back
        tomorrow.
      </p>
      <Link
        href="/reports/nightly"
        className="text-sm text-opsos-brass-600 hover:underline"
      >
        View Nightly Report
      </Link>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

