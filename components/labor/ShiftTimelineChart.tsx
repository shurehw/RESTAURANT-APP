'use client';

/**
 * Shift Timeline Chart
 * Polished Gantt-style visual timeline showing shift bars grouped by position
 * category, with SVG headcount overlay, day selection, and interactive tooltips.
 */

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Clock, Users, CalendarDays } from 'lucide-react';

interface Shift {
  id: string;
  employee_id: string;
  position_id: string;
  business_date: string;
  shift_type: string;
  scheduled_start: string;
  scheduled_end: string;
  scheduled_hours: number;
  status: string;
  is_modified?: boolean;
  employee: { first_name: string; last_name: string } | null;
  position: { name: string; category?: string; base_hourly_rate: number } | null;
}

interface WeekDay {
  date: string;
  dayName: string;
  dateStr: string;
}

interface ShiftTimelineChartProps {
  shifts: Shift[];
  weekDays: WeekDay[];
  onShiftClick?: (shift: Shift) => void;
}

// ── Layout ──

const ROW_HEIGHT = 34;
const ROW_GAP = 3;
const BAR_HEIGHT = 28;
const LABEL_WIDTH = 144;
const HEADCOUNT_HEIGHT = 76;

// ── Position ordering ──

const POSITION_ORDER: Record<string, number> = {
  'Prep Cook': 1, 'Line Cook': 2, 'Sous Chef': 3, 'Executive Chef': 4, 'Dishwasher': 5,
  'Bartender': 10, 'Barback': 11,
  'Host': 20, 'Hostess': 21, 'Server': 22, 'Busser': 23, 'Food Runner': 24, 'Sommelier': 25,
  'General Manager': 90, 'Assistant Manager': 91, 'Shift Manager': 92, 'Manager': 93,
};

// ── Category styling ──

const CATEGORY_META: Record<string, {
  order: number; label: string; gradient: string; dot: string; headerCls: string;
}> = {
  back_of_house: {
    order: 0,
    label: 'Back of House',
    gradient: 'from-amber-500 to-orange-500',
    dot: 'bg-amber-500',
    headerCls: 'text-amber-800 bg-amber-50/80 border-amber-200/60',
  },
  front_of_house: {
    order: 1,
    label: 'Front of House',
    gradient: 'from-emerald-500 to-teal-500',
    dot: 'bg-emerald-500',
    headerCls: 'text-emerald-800 bg-emerald-50/80 border-emerald-200/60',
  },
  management: {
    order: 2,
    label: 'Management',
    gradient: 'from-indigo-400 to-violet-500',
    dot: 'bg-violet-500',
    headerCls: 'text-violet-800 bg-violet-50/80 border-violet-200/60',
  },
};

const DEFAULT_CATEGORY_META = {
  order: 5,
  label: 'Other',
  gradient: 'from-slate-400 to-slate-500',
  dot: 'bg-slate-400',
  headerCls: 'text-slate-700 bg-slate-50/80 border-slate-200/60',
};

const MODIFIED_GRADIENT = 'from-rose-500 to-pink-500';

// ── Helpers ──

function getDecimalHour(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

function formatHourLabel(h: number): string {
  const actual = ((h % 24) + 24) % 24;
  if (actual === 0) return '12a';
  if (actual === 12) return '12p';
  if (actual < 12) return `${actual}a`;
  return `${actual - 12}p`;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    let hour = d.getUTCHours();
    const minute = d.getUTCMinutes().toString().padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
  }
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
  }
  return timeStr;
}

function assignLanes(shifts: Shift[]): { shift: Shift; lane: number }[] {
  const sorted = [...shifts].sort(
    (a, b) => getDecimalHour(a.scheduled_start) - getDecimalHour(b.scheduled_start),
  );
  const laneEnds: number[] = [];
  const result: { shift: Shift; lane: number }[] = [];
  for (const shift of sorted) {
    const startH = getDecimalHour(shift.scheduled_start);
    let assignedLane = laneEnds.findIndex((endH) => endH <= startH);
    if (assignedLane === -1) {
      assignedLane = laneEnds.length;
      laneEnds.push(0);
    }
    let endH = getDecimalHour(shift.scheduled_end);
    if (endH < startH) endH += 24;
    laneEnds[assignedLane] = endH;
    result.push({ shift, lane: assignedLane });
  }
  return result;
}

// ── Component ──

export function ShiftTimelineChart({ shifts, weekDays, onShiftClick }: ShiftTimelineChartProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const idx = weekDays.findIndex((day) => shifts.some((s) => s.business_date === day.date));
    return idx >= 0 ? idx : 0;
  });

  const selectedDay = weekDays[selectedDayIndex];
  const dayShifts = useMemo(
    () => shifts.filter((s) => s.business_date === selectedDay?.date),
    [shifts, selectedDay?.date],
  );

  // ── Time range ──
  const { timelineStart, timelineEnd, totalHours } = useMemo(() => {
    if (dayShifts.length === 0) return { timelineStart: 14, timelineEnd: 26, totalHours: 12 };
    const starts = dayShifts.map((s) => getDecimalHour(s.scheduled_start));
    const ends = dayShifts.map((s) => {
      const e = getDecimalHour(s.scheduled_end);
      const st = getDecimalHour(s.scheduled_start);
      return e < st ? e + 24 : e;
    });
    const tStart = Math.max(0, Math.floor(Math.min(...starts)) - 1);
    const tEnd = Math.min(Math.ceil(Math.max(...ends)) + 1, 30);
    return { timelineStart: tStart, timelineEnd: tEnd, totalHours: tEnd - tStart };
  }, [dayShifts]);

  // ── Category groups ──
  const categoryGroups = useMemo(() => {
    const catMap: Record<string, Record<string, Shift[]>> = {};
    for (const shift of dayShifts) {
      const cat = shift.position?.category || 'other';
      const pos = shift.position?.name || 'Unknown';
      if (!catMap[cat]) catMap[cat] = {};
      if (!catMap[cat][pos]) catMap[cat][pos] = [];
      catMap[cat][pos].push(shift);
    }
    return Object.entries(catMap)
      .sort(([a], [b]) => (CATEGORY_META[a]?.order ?? 5) - (CATEGORY_META[b]?.order ?? 5))
      .map(([cat, positions]) => ({
        category: cat,
        meta: CATEGORY_META[cat] || DEFAULT_CATEGORY_META,
        positions: Object.entries(positions).sort(
          ([a], [b]) => (POSITION_ORDER[a] ?? 50) - (POSITION_ORDER[b] ?? 50),
        ),
      }));
  }, [dayShifts]);

  // ── Headcount at 15-min intervals ──
  const headcountData = useMemo(() => {
    const points: { hour: number; count: number }[] = [];
    for (let h = timelineStart; h <= timelineEnd; h += 0.25) {
      let count = 0;
      for (const shift of dayShifts) {
        const startH = getDecimalHour(shift.scheduled_start);
        let endH = getDecimalHour(shift.scheduled_end);
        if (endH < startH) endH += 24;
        if (h >= startH && h < endH) count++;
      }
      points.push({ hour: h, count });
    }
    return points;
  }, [dayShifts, timelineStart, timelineEnd]);

  const maxHeadcount = Math.max(...headcountData.map((p) => p.count), 1);

  // ── Summary stats ──
  const stats = useMemo(
    () => ({
      shifts: dayShifts.length,
      hours: dayShifts.reduce((sum, s) => sum + (s.scheduled_hours || 0), 0),
      peak: maxHeadcount,
    }),
    [dayShifts, maxHeadcount],
  );

  // ── SVG headcount area ──
  const { areaPath, linePath } = useMemo(() => {
    if (headcountData.length === 0 || maxHeadcount === 0) return { areaPath: '', linePath: '' };
    const W = 1000;
    const H = 64;
    const padTop = 8;
    const usable = H - padTop;
    const pts = headcountData.map((p) => ({
      x: ((p.hour - timelineStart) / totalHours) * W,
      y: H - (p.count / maxHeadcount) * usable,
    }));
    return {
      areaPath:
        `M ${pts[0].x},${H} ` +
        pts.map((p) => `L ${p.x},${p.y}`).join(' ') +
        ` L ${pts[pts.length - 1].x},${H} Z`,
      linePath: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' '),
    };
  }, [headcountData, timelineStart, totalHours, maxHeadcount]);

  // ── Now indicator ──
  const nowPct = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    if (selectedDay?.date !== today) return null;
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h < timelineStart || h > timelineEnd) return null;
    return ((h - timelineStart) / totalHours) * 100;
  }, [selectedDay?.date, timelineStart, timelineEnd, totalHours]);

  // ── Bar helpers ──
  function barPos(shift: Shift) {
    const startH = getDecimalHour(shift.scheduled_start);
    let endH = getDecimalHour(shift.scheduled_end);
    if (endH < startH) endH += 24;
    const leftPct = ((startH - timelineStart) / totalHours) * 100;
    const widthPct = ((endH - startH) / totalHours) * 100;
    return {
      left: `${Math.max(0, leftPct)}%`,
      width: `${Math.min(widthPct, 100 - Math.max(0, leftPct))}%`,
    };
  }

  function barGradient(shift: Shift) {
    if (shift.is_modified) return MODIFIED_GRADIENT;
    return (CATEGORY_META[shift.position?.category || ''] || DEFAULT_CATEGORY_META).gradient;
  }

  const hourMarkers = Array.from({ length: totalHours + 1 }, (_, i) => timelineStart + i);

  if (!selectedDay) return null;

  // ── Render ──
  return (
    <Card className="overflow-hidden border-border">
      {/* ── Header ── */}
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brass/10 flex items-center justify-center">
              <Clock className="w-[18px] h-[18px] text-brass" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground leading-tight">
                Shift Timeline
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedDay.dayName} {selectedDay.dateStr}
              </p>
            </div>
          </div>

          {/* Summary stats */}
          {stats.shifts > 0 && (
            <div className="flex items-center gap-2">
              {[
                { icon: CalendarDays, val: stats.shifts, unit: 'shifts' },
                { icon: Clock, val: stats.hours.toFixed(1), unit: 'hrs' },
                { icon: Users, val: stats.peak, unit: 'peak' },
              ].map(({ icon: Icon, val, unit }) => (
                <div
                  key={unit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border text-xs"
                >
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-semibold text-foreground tabular-nums">{val}</span>
                  <span className="text-muted-foreground">{unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Accent stripe ── */}
      <div className="h-[2px] bg-brass mx-5 mt-4 rounded-full opacity-70" />

      {/* ── Day selector ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="inline-flex items-center gap-0.5 p-1 bg-muted/60 rounded-lg border border-border/50">
          {weekDays.map((day, idx) => {
            const active = idx === selectedDayIndex;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDayIndex(idx)}
                className={`relative px-3 py-1.5 text-xs rounded-md transition-all duration-150 min-w-[44px] ${
                  active
                    ? 'bg-card text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card/50 font-medium'
                }`}
              >
                {day.dayName}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="px-5 pb-3 flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        {Object.values(CATEGORY_META).map((meta) => (
          <div key={meta.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-[3px] ${meta.dot}`} />
            <span>{meta.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-[3px] bg-gradient-to-br from-rose-500 to-pink-500" />
          <span>Modified</span>
        </div>
        {nowPct !== null && (
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-px h-3 bg-rose-500" />
            <span className="text-rose-500 font-medium">Now</span>
          </div>
        )}
      </div>

      {/* ── Chart body ── */}
      {dayShifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
            <CalendarDays className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No shifts scheduled</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {selectedDay.dayName} {selectedDay.dateStr}
          </p>
        </div>
      ) : (
        <div key={selectedDay.date} className="px-5 pb-5 overflow-x-auto animate-fade-in">
          <div style={{ minWidth: 720 }} className="rounded-lg border border-border overflow-hidden">
            {/* ── Time axis ── */}
            <div className="flex bg-muted/40 border-b border-border">
              <div style={{ width: LABEL_WIDTH }} className="shrink-0 border-r border-border" />
              <div className="flex-1 relative h-7">
                {hourMarkers.map((h) => (
                  <span
                    key={h}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground tabular-nums"
                    style={{ left: `${((h - timelineStart) / totalHours) * 100}%` }}
                  >
                    {formatHourLabel(h)}
                  </span>
                ))}
                {/* Now dot on axis */}
                {nowPct !== null && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-200 z-10"
                    style={{ left: `${nowPct}%` }}
                  />
                )}
              </div>
            </div>

            {/* ── Category groups ── */}
            {categoryGroups.map(({ category, meta, positions }) => (
              <div key={category}>
                {/* Category header */}
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider border-b ${meta.headerCls}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                  <span className="font-normal normal-case tracking-normal text-[10px] opacity-50 ml-1">
                    {positions.reduce((n, [, s]) => n + s.length, 0)} shifts
                  </span>
                </div>

                {/* Position rows */}
                {positions.map(([posName, posShifts], posIdx) => {
                  const lanes = assignLanes(posShifts);
                  const laneCount = Math.max(...lanes.map((l) => l.lane), 0) + 1;
                  const rowH = laneCount * ROW_HEIGHT + ROW_GAP * 2;

                  return (
                    <div
                      key={posName}
                      className={`flex border-b border-border/50 ${
                        posIdx % 2 === 1 ? 'bg-muted/20' : ''
                      }`}
                      style={{ height: rowH }}
                    >
                      {/* Position label */}
                      <div
                        style={{ width: LABEL_WIDTH }}
                        className="shrink-0 flex items-center justify-between px-3 border-r border-border/50"
                      >
                        <span className="text-xs font-medium text-foreground truncate">
                          {posName}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums ml-1.5 shrink-0">
                          {posShifts.length}
                        </span>
                      </div>

                      {/* Timeline area */}
                      <div className="flex-1 relative">
                        {/* Gridlines */}
                        {hourMarkers.map((h) => (
                          <div
                            key={h}
                            className="absolute top-0 bottom-0 border-l border-border/25"
                            style={{ left: `${((h - timelineStart) / totalHours) * 100}%` }}
                          />
                        ))}

                        {/* Now line */}
                        {nowPct !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-rose-500/70 z-20"
                            style={{ left: `${nowPct}%` }}
                          />
                        )}

                        {/* Shift bars */}
                        {lanes.map(({ shift, lane }) => {
                          const pos = barPos(shift);
                          const grad = barGradient(shift);
                          const emp = shift.employee
                            ? `${shift.employee.first_name} ${shift.employee.last_name[0]}.`
                            : 'TBD';

                          return (
                            <div
                              key={shift.id}
                              className={`absolute rounded-md bg-gradient-to-r ${grad} text-white cursor-pointer group
                                shadow-sm hover:shadow-lg hover:-translate-y-px transition-all duration-150`}
                              style={{
                                left: pos.left,
                                width: pos.width,
                                top: ROW_GAP + lane * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
                                height: BAR_HEIGHT,
                              }}
                              onClick={() => onShiftClick?.(shift)}
                            >
                              {/* Bar content */}
                              <div className="px-2 h-full flex items-center gap-1 overflow-hidden">
                                <span className="text-[11px] font-semibold truncate">{emp}</span>
                                <span className="text-[10px] opacity-80 ml-auto shrink-0 tabular-nums hidden sm:inline">
                                  {shift.scheduled_hours}h
                                </span>
                              </div>

                              {/* Hover tooltip */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-40">
                                <div className="bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-xl min-w-[168px]">
                                  <div className="font-semibold text-xs">
                                    {shift.employee
                                      ? `${shift.employee.first_name} ${shift.employee.last_name}`
                                      : 'Unassigned'}
                                  </div>
                                  <div className="text-gray-400 text-[10px] mt-0.5">
                                    {shift.position?.name}
                                  </div>
                                  <div className="border-t border-gray-700 my-1.5" />
                                  <div>
                                    {formatTime(shift.scheduled_start)} –{' '}
                                    {formatTime(shift.scheduled_end)}
                                  </div>
                                  <div className="text-gray-400">
                                    {shift.scheduled_hours} hours
                                  </div>
                                  {shift.is_modified && (
                                    <div className="text-rose-400 mt-1.5 text-[10px] font-medium">
                                      ● Manager modified
                                    </div>
                                  )}
                                </div>
                                {/* Tooltip caret */}
                                <div className="flex justify-center">
                                  <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ── Headcount area chart ── */}
            <div className="flex" style={{ height: HEADCOUNT_HEIGHT }}>
              <div
                style={{ width: LABEL_WIDTH }}
                className="shrink-0 flex items-center gap-1.5 px-3 border-r border-border/50 bg-muted/30"
              >
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Headcount</span>
              </div>
              <div className="flex-1 relative bg-muted/10">
                {/* Gridlines */}
                {hourMarkers.map((h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/25"
                    style={{ left: `${((h - timelineStart) / totalHours) * 100}%` }}
                  />
                ))}

                {/* Now line */}
                {nowPct !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-rose-500/70 z-20"
                    style={{ left: `${nowPct}%` }}
                  />
                )}

                {/* SVG area chart */}
                <svg
                  viewBox="0 0 1000 64"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full"
                >
                  <defs>
                    <linearGradient id="hcGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--opsos-brass)" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="var(--opsos-brass)" stopOpacity="0.03" />
                    </linearGradient>
                  </defs>
                  {areaPath && <path d={areaPath} fill="url(#hcGrad)" />}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="var(--opsos-brass)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>

                {/* Peak label */}
                <div className="absolute top-1.5 right-2.5 text-[10px] font-semibold text-brass tabular-nums">
                  Peak: {maxHeadcount}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
