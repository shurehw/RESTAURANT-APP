'use client';

/**
 * Schedule Comparison Component
 * Compare the current (OpsOS-generated) week side-by-side with up to 4 previous weeks.
 * Shows: total heads, hours, cost, labor %, position breakdown, and day-by-day staffing.
 */

import { useState, useEffect, useCallback } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Clock,
  DollarSign,
  BarChart3,
  Calendar,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftRecord {
  business_date: string;
  scheduled_hours: number;
  scheduled_cost: number;
  position: { name: string; category: string } | null;
  employee: { first_name: string; last_name: string } | null;
}

interface WeekSummary {
  weekStart: string;
  label: string;
  status: 'draft' | 'published' | 'locked' | 'missing';
  totalShifts: number;
  totalHours: number;
  totalCost: number;
  laborPct: number | null;
  projectedRevenue: number | null;
  byPosition: Record<string, { count: number; hours: number; cost: number }>;
  byDay: Record<string, { count: number; hours: number; cost: number }>;
  fohHours: number;
  bohHours: number;
}

interface Props {
  venueId: string;
  venueName?: string;
  currentWeekStart: string; // The "current" week to anchor comparison
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(weekStart: string, isCurrent = false): string {
  const d = new Date(weekStart + 'T12:00:00Z');
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const label = `${fmt(d)} – ${fmt(end)}`;
  return isCurrent ? `${label} (current)` : label;
}

function weekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d);
    cur.setUTCDate(cur.getUTCDate() + i);
    dates.push(cur.toISOString().split('T')[0]);
  }
  return dates;
}

function delta(current: number, prev: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0) return { pct: 0, dir: 'flat' };
  const pct = ((current - prev) / prev) * 100;
  return { pct, dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

function DeltaBadge({ current, prev, lowerIsBetter = false }: { current: number; prev: number; lowerIsBetter?: boolean }) {
  const { pct, dir } = delta(current, prev);
  if (dir === 'flat') return <span className="text-gray-400 text-xs">—</span>;
  const positive = lowerIsBetter ? dir === 'down' : dir === 'up';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
      {dir === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// Color per position category
function positionColor(cat: string): string {
  if (cat === 'management') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (cat === 'front_of_house') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (cat === 'back_of_house') return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleCompare({ venueId, venueName, currentWeekStart }: Props) {
  const { selectedVenue } = useVenue();

  // Active venue (always use URL prop as source of truth)
  const activeVenueId = venueId;

  // Week being viewed as "current"
  const [anchorWeek, setAnchorWeek] = useState(currentWeekStart);

  // How many past weeks to show: 1, 2, 3, or 4
  const [numPrev, setNumPrev] = useState(3);

  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigate anchor
  const navigateAnchor = (dir: 'prev' | 'next') => {
    setAnchorWeek(prev => addWeeks(prev, dir === 'next' ? 1 : -1));
  };

  // Fetch week summaries
  const loadWeeks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekStarts = [anchorWeek];
      for (let i = 1; i <= numPrev; i++) weekStarts.push(addWeeks(anchorWeek, -i));

      const results = await Promise.all(
        weekStarts.map(ws => fetchWeekSummary(activeVenueId, ws))
      );
      setWeeks(results);
    } catch (e) {
      setError('Failed to load schedule data');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeVenueId, anchorWeek, numPrev]);

  useEffect(() => { loadWeeks(); }, [loadWeeks]);

  // If venue changes, reload
  useEffect(() => {
    if (selectedVenue?.id && selectedVenue.id !== activeVenueId) {
      window.location.href = `/labor/schedule/compare?week=${anchorWeek}&venue=${selectedVenue.id}`;
    }
  }, [selectedVenue?.id]);

  // Current week is weeks[0]
  const currentWeek = weeks[0];
  const prevWeeks = weeks.slice(1);

  // All unique positions across all weeks
  const allPositions = Array.from(
    new Set(weeks.flatMap(w => Object.keys(w.byPosition)))
  ).sort((a, b) => {
    // Sort by category
    const catA = weeks.find(w => w.byPosition[a])?.byPosition[a] ? 0 : 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6">
      {/* ── Header Controls ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Venue label */}
            {venueName && (
              <span className="text-sm font-semibold text-opsos-sage-700 border border-opsos-sage-300 rounded px-2 py-1 bg-opsos-sage-50">
                {venueName}
              </span>
            )}

            {/* Week navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateAnchor('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-medium px-2">
                <span className="text-gray-500">Current week:</span>{' '}
                <span className="text-gray-900">{formatWeekLabel(anchorWeek)}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigateAnchor('next')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={anchorWeek}
                onChange={(e) => {
                  if (e.target.value) {
                    const d = new Date(e.target.value + 'T12:00:00Z');
                    const day = d.getUTCDay();
                    const diff = day === 0 ? -6 : 1 - day;
                    d.setUTCDate(d.getUTCDate() + diff);
                    setAnchorWeek(d.toISOString().split('T')[0]);
                  }
                }}
              />
            </div>

            {/* Past weeks selector */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Compare against</span>
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => setNumPrev(n)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    numPrev === n
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {n} prev {n === 1 ? 'week' : 'weeks'}
                </button>
              ))}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={loadWeeks} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading schedule data…
        </div>
      )}

      {!loading && weeks.length > 0 && (
        <>
          {/* ── KPI Summary Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<Users className="w-5 h-5 text-blue-500" />}
              label="Total Shifts"
              current={currentWeek?.totalShifts ?? 0}
              prevWeeks={prevWeeks}
              format={n => n.toLocaleString()}
            />
            <KpiCard
              icon={<Clock className="w-5 h-5 text-violet-500" />}
              label="Labor Hours"
              current={currentWeek?.totalHours ?? 0}
              prevWeeks={prevWeeks}
              format={n => `${n.toFixed(1)}h`}
            />
            <KpiCard
              icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
              label="Labor Cost"
              current={currentWeek?.totalCost ?? 0}
              prevWeeks={prevWeeks}
              format={n => `$${Math.round(n).toLocaleString()}`}
              lowerIsBetter
            />
            <KpiCard
              icon={<BarChart3 className="w-5 h-5 text-amber-500" />}
              label="Labor %"
              current={currentWeek?.laborPct ?? 0}
              prevWeeks={prevWeeks}
              format={n => `${n.toFixed(1)}%`}
              lowerIsBetter
            />
          </div>

          {/* ── Main comparison table ── */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Week-over-Week Summary</h3>
              <span className="text-xs text-gray-400 ml-1">Current week vs. previous</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-44">Metric</th>
                    {weeks.map((w, i) => (
                      <th key={w.weekStart} className={`text-center px-4 py-3 font-medium ${i === 0 ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600'}`}>
                        <div className="text-xs">{i === 0 ? '▶ Current' : `−${i}w`}</div>
                        <div className="text-[11px] font-normal text-gray-500 mt-0.5">
                          {new Date(w.weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        </div>
                        {w.status !== 'missing' && (
                          <Badge
                            variant={w.status === 'published' ? 'default' : w.status === 'locked' ? 'sage' : 'outline'}
                            className="text-[10px] mt-1 capitalize"
                          >
                            {w.status}
                          </Badge>
                        )}
                        {w.status === 'missing' && (
                          <span className="text-[10px] text-gray-400 block mt-1">No schedule</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Total Shifts', key: 'totalShifts', format: (n: number) => n.toString(), lowerBetter: false },
                    { label: 'Labor Hours', key: 'totalHours', format: (n: number) => `${n.toFixed(1)}h`, lowerBetter: false },
                    { label: 'Labor Cost', key: 'totalCost', format: (n: number) => `$${Math.round(n).toLocaleString()}`, lowerBetter: true },
                    { label: 'Labor %', key: 'laborPct', format: (n: number) => n ? `${n.toFixed(1)}%` : '—', lowerBetter: true },
                    { label: 'Proj. Revenue', key: 'projectedRevenue', format: (n: number) => n ? `$${Math.round(n).toLocaleString()}` : '—', lowerBetter: false },
                    { label: 'FOH Hours', key: 'fohHours', format: (n: number) => `${n.toFixed(1)}h`, lowerBetter: false },
                    { label: 'BOH Hours', key: 'bohHours', format: (n: number) => `${n.toFixed(1)}h`, lowerBetter: false },
                  ].map((row, ridx) => (
                    <tr key={row.key} className={`border-b ${ridx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{row.label}</td>
                      {weeks.map((w, i) => {
                        const val = (w as any)[row.key] ?? 0;
                        const prevVal = i > 0 ? (weeks[i - 1] as any)[row.key] ?? 0 : null;
                        return (
                          <td key={w.weekStart} className={`text-center px-4 py-2.5 ${i === 0 ? 'bg-indigo-50/40 font-semibold text-indigo-800' : 'text-gray-700'}`}>
                            <div>{row.format(val)}</div>
                            {i === 0 && prevVal !== null && val !== 0 && prevVal !== 0 && (
                              <div className="mt-0.5">
                                <DeltaBadge current={val} prev={prevVal} lowerIsBetter={row.lowerBetter} />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Day-by-Day Staffing Grid ── */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Daily Headcount by Week</h3>
              <span className="text-xs text-gray-400 ml-1">Staff scheduled per day</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Day</th>
                    {weeks.map((w, i) => (
                      <th key={w.weekStart} className={`text-center px-3 py-2.5 font-medium text-xs ${i === 0 ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500'}`}>
                        {i === 0 ? 'Current' : `−${i}w`}<br />
                        <span className="font-normal text-gray-400">
                          {new Date(w.weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DOW.map((dow, dowIdx) => {
                    const isWeekend = dow === 'Sat' || dow === 'Sun';
                    return (
                      <tr key={dow} className={`border-b ${isWeekend ? 'bg-amber-50/30' : dowIdx % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                        <td className={`px-4 py-2 font-semibold ${isWeekend ? 'text-amber-700' : 'text-gray-700'}`}>
                          {dow}
                        </td>
                        {weeks.map((w, weekIdx) => {
                          const date = addWeeks(w.weekStart, 0);
                          const dayDate = weekDates(w.weekStart)[dowIdx];
                          const d = w.byDay[dayDate];
                          const count = d?.count ?? 0;
                          const prevCount = weekIdx > 0 ? (weeks[weekIdx - 1].byDay[weekDates(weeks[weekIdx - 1].weekStart)[dowIdx]]?.count ?? 0) : null;
                          const { dir } = weekIdx === 0 && prevCount !== null ? delta(count, prevCount) : { dir: 'flat' };

                          return (
                            <td key={w.weekStart} className={`text-center px-3 py-2 ${weekIdx === 0 ? 'bg-indigo-50/40' : ''}`}>
                              {count > 0 ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className={`font-semibold ${weekIdx === 0 ? 'text-indigo-700' : 'text-gray-700'}`}>
                                    {count}
                                  </span>
                                  {weekIdx === 0 && prevCount !== null && prevCount > 0 && dir !== 'flat' && (
                                    <span className={`text-[10px] ${dir === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {dir === 'up' ? '▲' : '▼'}{Math.abs(count - prevCount)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Position Breakdown ── */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Position Breakdown</h3>
              <span className="text-xs text-gray-400 ml-1">Avg headcount per day, by role</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-48">Position</th>
                    {weeks.map((w, i) => (
                      <th key={w.weekStart} className={`text-center px-3 py-2.5 font-medium text-xs ${i === 0 ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500'}`}>
                        {i === 0 ? 'Current' : `−${i}w`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPositions.map((pos, pidx) => {
                    // Determine category from any week that has this position
                    const cat = weeks.flatMap(w =>
                      w.byPosition[pos] ? [/* we don't store cat here */] : []
                    )[0] ?? '';

                    return (
                      <tr key={pos} className={`border-b ${pidx % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${positionColor(cat)}`}>
                            {pos}
                          </span>
                        </td>
                        {weeks.map((w, weekIdx) => {
                          const d = w.byPosition[pos];
                          const count = d?.count ?? 0;
                          const hours = d?.hours ?? 0;
                          const prevCount = weekIdx > 0 ? (weeks[weekIdx - 1].byPosition[pos]?.count ?? 0) : null;
                          const { dir } = weekIdx === 0 && prevCount !== null ? delta(count, prevCount) : { dir: 'flat' };

                          return (
                            <td key={w.weekStart} className={`text-center px-3 py-2 ${weekIdx === 0 ? 'bg-indigo-50/40 font-semibold text-indigo-700' : 'text-gray-600'}`}>
                              {count > 0 ? (
                                <div>
                                  <div>{count} <span className="text-[10px] font-normal text-gray-400">shifts</span></div>
                                  <div className="text-[10px] text-gray-400">{hours.toFixed(0)}h</div>
                                  {weekIdx === 0 && prevCount !== null && prevCount > 0 && dir !== 'flat' && (
                                    <span className={`text-[10px] ${dir === 'up' ? 'text-emerald-500' : 'text-red-400'}`}>
                                      {dir === 'up' ? '▲' : '▼'}{Math.abs(count - prevCount)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── FOH / BOH split bar ── */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">FOH vs BOH Hours Split</h3>
            <div className="space-y-3">
              {weeks.map((w, i) => {
                const total = w.fohHours + w.bohHours;
                const fohPct = total > 0 ? (w.fohHours / total) * 100 : 50;
                const bohPct = 100 - fohPct;
                return (
                  <div key={w.weekStart}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium w-20 ${i === 0 ? 'text-indigo-700' : 'text-gray-500'}`}>
                        {i === 0 ? '▶ Current' : `−${i}w`}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {new Date(w.weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </span>
                      {w.status === 'missing' && <span className="text-[11px] text-gray-400 italic">no data</span>}
                    </div>
                    {w.status !== 'missing' && total > 0 && (
                      <div className="flex rounded-full overflow-hidden h-6">
                        <div
                          className="bg-blue-400 flex items-center justify-center text-white text-[10px] font-semibold transition-all"
                          style={{ width: `${fohPct}%` }}
                        >
                          {fohPct >= 15 && `FOH ${fohPct.toFixed(0)}%`}
                        </div>
                        <div
                          className="bg-orange-400 flex items-center justify-center text-white text-[10px] font-semibold transition-all"
                          style={{ width: `${bohPct}%` }}
                        >
                          {bohPct >= 15 && `BOH ${bohPct.toFixed(0)}%`}
                        </div>
                      </div>
                    )}
                    {w.status !== 'missing' && total === 0 && (
                      <div className="h-6 bg-gray-100 rounded-full flex items-center justify-center text-[11px] text-gray-400">
                        No shift data
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, current, prevWeeks, format, lowerIsBetter = false,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  prevWeeks: WeekSummary[];
  format: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  const latest = prevWeeks[0];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{format(current)}</div>
      {latest && latest.status !== 'missing' && (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-gray-400">vs {format((latest as any)[label === 'Total Shifts' ? 'totalShifts' : label === 'Labor Hours' ? 'totalHours' : label === 'Labor Cost' ? 'totalCost' : 'laborPct'] ?? 0)}</span>
          <DeltaBadge current={current} prev={(latest as any)[label === 'Total Shifts' ? 'totalShifts' : label === 'Labor Hours' ? 'totalHours' : label === 'Labor Cost' ? 'totalCost' : 'laborPct'] ?? 0} lowerIsBetter={lowerIsBetter} />
        </div>
      )}
    </Card>
  );
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchWeekSummary(venueId: string, weekStart: string): Promise<WeekSummary> {
  const res = await fetch(
    `/api/labor/schedule/compare?venue_id=${venueId}&week_start=${weekStart}`
  );
  if (!res.ok) {
    return emptyWeek(weekStart);
  }
  const data = await res.json();
  if (!data.schedule) return emptyWeek(weekStart);

  const shifts: ShiftRecord[] = data.shifts ?? [];
  const schedule = data.schedule;

  const byPosition: Record<string, { count: number; hours: number; cost: number }> = {};
  const byDay: Record<string, { count: number; hours: number; cost: number }> = {};
  let fohHours = 0;
  let bohHours = 0;

  for (const s of shifts) {
    const pos = s.position?.name ?? 'Unknown';
    const cat = s.position?.category ?? '';
    const date = s.business_date;
    const hrs = Number(s.scheduled_hours) || 0;
    const cost = Number(s.scheduled_cost) || 0;

    // By position
    if (!byPosition[pos]) byPosition[pos] = { count: 0, hours: 0, cost: 0 };
    byPosition[pos].count += 1;
    byPosition[pos].hours += hrs;
    byPosition[pos].cost += cost;

    // By day
    if (!byDay[date]) byDay[date] = { count: 0, hours: 0, cost: 0 };
    byDay[date].count += 1;
    byDay[date].hours += hrs;
    byDay[date].cost += cost;

    // FOH / BOH
    if (cat === 'front_of_house') fohHours += hrs;
    if (cat === 'back_of_house') bohHours += hrs;
  }

  return {
    weekStart,
    label: formatWeekLabel(weekStart),
    status: schedule.status ?? 'draft',
    totalShifts: shifts.length,
    totalHours: Number(schedule.total_labor_hours) || 0,
    totalCost: Number(schedule.total_labor_cost) || 0,
    laborPct: schedule.labor_percentage ? Number(schedule.labor_percentage) : null,
    projectedRevenue: schedule.projected_revenue ? Number(schedule.projected_revenue) : null,
    byPosition,
    byDay,
    fohHours,
    bohHours,
  };
}

function emptyWeek(weekStart: string): WeekSummary {
  return {
    weekStart,
    label: formatWeekLabel(weekStart),
    status: 'missing',
    totalShifts: 0,
    totalHours: 0,
    totalCost: 0,
    laborPct: null,
    projectedRevenue: null,
    byPosition: {},
    byDay: {},
    fohHours: 0,
    bohHours: 0,
  };
}
