/**
 * Venue Health Report
 * Source of truth for venue health scores across daily, weekly, and period views.
 * Corporate portfolio view (all venues) + individual venue drill-down.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { ContextBand, ContextBadge } from '@/components/ui/ContextBand';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Activity,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

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

interface SignalRow {
  signal: string;
  risk: number;
  confidence: number;
  reason: string;
  raw_inputs: Record<string, unknown>;
  date: string;
}

interface ActionRow {
  id: string;
  signal: string;
  status: string;
  action_type: string;
  action_detail: string;
  created_at: string;
  completed_at: string | null;
  date: string;
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
  signals: SignalRow[] | null;
  actions: ActionRow[] | null;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; border: string; ring: string }> = {
  GREEN:  { dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-200' },
  YELLOW: { dot: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   ring: 'ring-amber-200' },
  ORANGE: { dot: 'bg-orange-500',  bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  ring: 'ring-orange-200' },
  RED:    { dot: 'bg-red-500',     bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     ring: 'ring-red-200' },
};

type ViewTab = 'daily' | 'weekly' | 'period';

// ── Page ────────────────────────────────────────────────────────────────────

export default function VenueHealthPage() {
  const { selectedVenue } = useVenue();
  const [view, setView] = useState<ViewTab>('daily');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const venueId = selectedVenue?.id && selectedVenue.id !== 'all' ? selectedVenue.id : null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view, date });
      if (venueId) params.set('venue_id', venueId);
      const res = await fetch(`/api/health?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [view, date, venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Date navigation
  const shiftDate = (days: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const shiftWeek = (weeks: number) => shiftDate(weeks * 7);
  const shiftPeriod = (dir: number) => shiftDate(dir * 28); // ~4 weeks

  return (
    <div>
      <ContextBand
        date={date}
        additionalContext={
          data ? (
            <>
              <ContextBadge
                label="AVG"
                value={Math.round(data.portfolio.avg_score)}
                variant={data.portfolio.avg_score >= 80 ? 'success' : data.portfolio.avg_score >= 65 ? 'warning' : 'critical'}
              />
              <ContextBadge label="VENUES" value={data.portfolio.venue_count} />
            </>
          ) : undefined
        }
      />

      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Activity className="w-8 h-8 text-emerald-600" />
              Venue Health
            </h1>
            <p className="text-muted-foreground mt-1">
              {venueId ? 'Detailed health breakdown' : 'Portfolio overview across all venues'}
            </p>
          </div>
          <VenueQuickSwitcher />
        </div>

        {/* View Tabs + Date Nav */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex rounded-lg border bg-card overflow-hidden">
            {(['daily', 'weekly', 'period'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  view === tab
                    ? 'bg-slate-900 text-white'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => view === 'daily' ? shiftDate(-1) : view === 'weekly' ? shiftWeek(-1) : shiftPeriod(-1)}
              className="p-2 rounded border hover:bg-accent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded border text-sm"
            />
            <button
              onClick={() => view === 'daily' ? shiftDate(1) : view === 'weekly' ? shiftWeek(1) : shiftPeriod(1)}
              className="p-2 rounded border hover:bg-accent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Period label */}
        {data && view !== 'daily' && (
          <div className="mb-4 text-sm text-muted-foreground">
            {data.period_label} &middot; {data.start_date} to {data.end_date}
          </div>
        )}

        {/* Loading / Error */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            Failed to load health data: {error}
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          venueId ? (
            <VenueDetail data={data} view={view} />
          ) : (
            <PortfolioOverview data={data} view={view} />
          )
        )}
      </div>
    </div>
  );
}

// ── Portfolio Overview (All Venues) ──────────────────────────────────────────

function PortfolioOverview({ data, view }: { data: HealthData; view: ViewTab }) {
  const { portfolio, venues } = data;

  return (
    <>
      {/* Status distribution */}
      <div className="flex items-center gap-3 mb-6">
        {(['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const).map(status => {
          const count = portfolio.status_counts[status];
          if (!count) return null;
          const s = STATUS_STYLES[status];
          return (
            <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${s.bg} ${s.text}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
              {count} {status}
            </span>
          );
        })}
        <span className="text-sm text-muted-foreground ml-2">
          Portfolio avg: <strong>{portfolio.avg_score}</strong>
        </span>
      </div>

      {/* Venue grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {venues.map((v) => (
          <VenueCard key={v.venue_id} venue={v} view={view} />
        ))}
      </div>

      {venues.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No health data for this {view === 'daily' ? 'date' : view === 'weekly' ? 'week' : 'period'}.
        </div>
      )}
    </>
  );
}

function VenueCard({ venue, view }: { venue: VenueSummary; view: ViewTab }) {
  const s = STATUS_STYLES[venue.status] || STATUS_STYLES.GREEN;
  const score = view === 'daily' ? venue.latest_score : venue.avg_score;
  const drivers = venue.latest_drivers || [];

  return (
    <div className={`rounded-lg border bg-card p-5 ${s.border}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{venue.venue_name}</h3>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${s.bg} ${s.text}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
          {Math.round(score)}
        </span>
      </div>

      {/* Signals */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {drivers.map(d => (
          <SignalPill key={d.signal} signal={d.signal} risk={d.risk} />
        ))}
      </div>

      {/* Weekly/Period: daily sparkline */}
      {view !== 'daily' && venue.daily.length > 1 && (
        <div className="mt-2 pt-2 border-t">
          <div className="flex gap-1 items-end h-8">
            {venue.daily.map((d, i) => {
              const pct = d.score / 100;
              const ds = STATUS_STYLES[d.status] || STATUS_STYLES.GREEN;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${ds.dot}`}
                  style={{ height: `${Math.max(pct * 100, 10)}%`, opacity: 0.8 }}
                  title={`${d.date}: ${Math.round(d.score)} (${d.status})`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{venue.daily[0]?.date?.slice(5)}</span>
            <span>{venue.daily[venue.daily.length - 1]?.date?.slice(5)}</span>
          </div>
          {venue.worst_day.score < venue.avg_score - 5 && (
            <div className="mt-1 text-xs text-amber-600 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Worst: {Math.round(venue.worst_day.score)} on {venue.worst_day.date.slice(5)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Venue Detail (Single Venue) ─────────────────────────────────────────────

function VenueDetail({ data, view }: { data: HealthData; view: ViewTab }) {
  const venue = data.venues[0];
  if (!venue) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No health data for this venue on the selected {view === 'daily' ? 'date' : view === 'weekly' ? 'week' : 'period'}.
      </div>
    );
  }

  const s = STATUS_STYLES[venue.status] || STATUS_STYLES.GREEN;
  const score = view === 'daily' ? venue.latest_score : venue.avg_score;
  const signals = data.signals || [];
  const actions = data.actions || [];

  // Group signals by date for multi-day views
  const latestSignals = view === 'daily'
    ? signals
    : signals.filter((sig, i, arr) => {
        // Keep only the latest date for each signal
        return !arr.slice(i + 1).some(s2 => s2.signal === sig.signal && s2.date > sig.date);
      });

  // Deduplicate by signal name (keep latest)
  const signalMap = new Map<string, SignalRow>();
  for (const sig of latestSignals) {
    if (!signalMap.has(sig.signal) || sig.date > signalMap.get(sig.signal)!.date) {
      signalMap.set(sig.signal, sig);
    }
  }

  return (
    <>
      {/* Big score display */}
      <div className={`rounded-xl border-2 ${s.border} ${s.bg} p-8 mb-6 flex items-center gap-8`}>
        <div className={`w-24 h-24 rounded-full ${s.bg} ring-4 ${s.ring} flex items-center justify-center`}>
          <span className={`text-4xl font-black ${s.text}`}>{Math.round(score)}</span>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-3 h-3 rounded-full ${s.dot}`} />
            <span className={`text-xl font-bold ${s.text}`}>{venue.status}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {venue.venue_name} &middot; {venue.days_count} day{venue.days_count !== 1 ? 's' : ''} of data
            {view !== 'daily' && ` &middot; Avg: ${venue.avg_score}`}
          </p>
        </div>

        {/* Trend for multi-day views */}
        {view !== 'daily' && venue.daily.length > 1 && (
          <div className="ml-auto flex flex-col items-end">
            <div className="flex gap-1 items-end h-12 w-40">
              {venue.daily.map((d, i) => {
                const pct = d.score / 100;
                const ds = STATUS_STYLES[d.status] || STATUS_STYLES.GREEN;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${ds.dot}`}
                    style={{ height: `${Math.max(pct * 100, 10)}%`, opacity: 0.8 }}
                    title={`${d.date}: ${Math.round(d.score)}`}
                  />
                );
              })}
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {venue.daily[0]?.date?.slice(5)} - {venue.daily[venue.daily.length - 1]?.date?.slice(5)}
            </span>
          </div>
        )}
      </div>

      {/* Signal detail cards */}
      <h2 className="text-lg font-semibold mb-3">Signals</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[...signalMap.values()].map(sig => (
          <SignalCard key={sig.signal} signal={sig} />
        ))}
        {signalMap.size === 0 && (
          <div className="col-span-3 text-center py-8 text-muted-foreground">No signal data available</div>
        )}
      </div>

      {/* Daily breakdown table (weekly/period only) */}
      {view !== 'daily' && venue.daily.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3">Daily Breakdown</h2>
          <div className="rounded-lg border bg-card overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-center font-medium">Score</th>
                  <th className="px-4 py-2 text-center font-medium">Status</th>
                  <th className="px-4 py-2 text-center font-medium">Signals</th>
                  <th className="px-4 py-2 text-left font-medium">Top Driver</th>
                </tr>
              </thead>
              <tbody>
                {venue.daily.map(d => {
                  const ds = STATUS_STYLES[d.status] || STATUS_STYLES.GREEN;
                  const topDriver = d.drivers?.reduce((a, b) => b.impact > a.impact ? b : a, d.drivers[0]);
                  return (
                    <tr key={d.date} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono">{d.date}</td>
                      <td className="px-4 py-2 text-center font-bold">{Math.round(d.score)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ds.bg} ${ds.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ds.dot}`} />
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">{d.signal_count}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[300px]">
                        {topDriver ? `${topDriver.signal}: ${topDriver.reason}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Open actions */}
      {actions.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Actions ({actions.filter(a => !a.completed_at).length} open)
          </h2>
          <div className="space-y-2 mb-6">
            {actions.map(action => (
              <div key={action.id} className={`rounded-lg border p-3 text-sm ${action.completed_at ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{action.action_type}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    action.status === 'fired' ? 'bg-red-50 text-red-700'
                    : action.status === 'acknowledged' ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {action.status}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1">{action.action_detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Shared Components ───────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: SignalRow }) {
  const risk = Number(signal.risk);
  const color = risk === 0
    ? 'border-emerald-200 bg-emerald-50'
    : risk < 0.3
    ? 'border-emerald-200 bg-emerald-50'
    : risk < 0.6
    ? 'border-amber-200 bg-amber-50'
    : 'border-red-200 bg-red-50';

  const textColor = risk === 0
    ? 'text-emerald-700'
    : risk < 0.3
    ? 'text-emerald-700'
    : risk < 0.6
    ? 'text-amber-700'
    : 'text-red-700';

  const label = signal.signal.charAt(0).toUpperCase() + signal.signal.slice(1);
  const riskPct = Math.round(risk * 100);

  return (
    <div className={`rounded-lg border ${color} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-bold ${textColor}`}>{label}</span>
        <span className={`text-2xl font-black ${textColor}`}>{riskPct}%</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{signal.reason}</p>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Confidence: {Math.round(Number(signal.confidence) * 100)}%
      </div>
    </div>
  );
}

function SignalPill({ signal, risk }: { signal: string; risk: number }) {
  const color = risk === 0
    ? 'bg-emerald-50 text-emerald-600'
    : risk < 0.3
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
