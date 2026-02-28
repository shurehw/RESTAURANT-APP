'use client';

/**
 * Shift Timeline Chart
 * Gantt-style visual timeline showing shift bars per position with overlap stacking,
 * headcount summary, and day selection.
 */

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users } from 'lucide-react';

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

// ── Constants ──

const ROW_HEIGHT = 30;
const ROW_PADDING = 3;
const BAR_HEIGHT = 24;
const LABEL_WIDTH = 120;
const HEADCOUNT_HEIGHT = 56;

// ── Position ordering (BOH first, then FOH, then management) ──

const POSITION_ORDER: Record<string, number> = {
  'Prep Cook': 1, 'Line Cook': 2, 'Sous Chef': 3, 'Executive Chef': 4, 'Dishwasher': 5,
  'Bartender': 10, 'Barback': 11,
  'Host': 20, 'Hostess': 21, 'Server': 22, 'Busser': 23, 'Food Runner': 24, 'Sommelier': 25,
  'General Manager': 90, 'Assistant Manager': 91, 'Shift Manager': 92, 'Manager': 93,
};

// ── Colors by category ──

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; hoverBg: string }> = {
  back_of_house: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-900',
    hoverBg: 'hover:bg-amber-100',
  },
  front_of_house: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-900',
    hoverBg: 'hover:bg-emerald-100',
  },
};

const DEFAULT_STYLE = {
  bg: 'bg-slate-50',
  border: 'border-slate-300',
  text: 'text-slate-800',
  hoverBg: 'hover:bg-slate-100',
};

const MODIFIED_STYLE = {
  bg: 'bg-amber-100',
  border: 'border-amber-500',
  text: 'text-amber-900',
  hoverBg: 'hover:bg-amber-200',
};

// ── Helpers ──

/** Extract decimal hour from ISO timestamp using UTC (venue stores local as UTC) */
function getDecimalHour(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** Format decimal hour to display label */
function formatHourLabel(h: number): string {
  const actual = ((h % 24) + 24) % 24;
  if (actual === 0) return '12AM';
  if (actual === 12) return '12PM';
  if (actual < 12) return `${actual}AM`;
  return `${actual - 12}PM`;
}

/** Format ISO timestamp to readable time */
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

/** Assign shifts to non-overlapping lanes within a position row */
function assignLanes(shifts: Shift[]): { shift: Shift; lane: number }[] {
  const sorted = [...shifts].sort(
    (a, b) => getDecimalHour(a.scheduled_start) - getDecimalHour(b.scheduled_start)
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
    const firstWithShifts = weekDays.findIndex((day) =>
      shifts.some((s) => s.business_date === day.date)
    );
    return firstWithShifts >= 0 ? firstWithShifts : 0;
  });

  const selectedDay = weekDays[selectedDayIndex];
  const dayShifts = useMemo(
    () => shifts.filter((s) => s.business_date === selectedDay?.date),
    [shifts, selectedDay?.date]
  );

  // ── Compute time range from shifts ──
  const { timelineStart, timelineEnd, totalHours } = useMemo(() => {
    if (dayShifts.length === 0) return { timelineStart: 14, timelineEnd: 26, totalHours: 12 };

    const starts = dayShifts.map((s) => getDecimalHour(s.scheduled_start));
    const ends = dayShifts.map((s) => {
      const endH = getDecimalHour(s.scheduled_end);
      const startH = getDecimalHour(s.scheduled_start);
      return endH < startH ? endH + 24 : endH;
    });

    const minStart = Math.floor(Math.min(...starts));
    const maxEnd = Math.ceil(Math.max(...ends));

    const tStart = Math.max(0, minStart - 1);
    const tEnd = Math.min(maxEnd + 1, 30);

    return { timelineStart: tStart, timelineEnd: tEnd, totalHours: tEnd - tStart };
  }, [dayShifts]);

  // ── Group shifts by position ──
  const positionGroups = useMemo(() => {
    const groups: Record<string, Shift[]> = {};
    for (const shift of dayShifts) {
      const posName = shift.position?.name || 'Unknown';
      if (!groups[posName]) groups[posName] = [];
      groups[posName].push(shift);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      const oa = POSITION_ORDER[a] ?? 50;
      const ob = POSITION_ORDER[b] ?? 50;
      return oa - ob;
    });
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
  const peakPoint = headcountData.reduce((max, p) => (p.count > max.count ? p : max), headcountData[0]);

  // ── Bar style calculator ──
  function getBarPosition(shift: Shift) {
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

  function getBarColors(shift: Shift) {
    if (shift.is_modified) return MODIFIED_STYLE;
    return CATEGORY_STYLES[shift.position?.category || ''] || DEFAULT_STYLE;
  }

  // ── Hour gridlines ──
  const hourMarkers = Array.from({ length: totalHours + 1 }, (_, i) => timelineStart + i);

  if (!selectedDay) return null;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Shift Timeline</h3>
          {dayShifts.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Day selector */}
        <div className="flex items-center gap-1">
          {weekDays.map((day, idx) => {
            const count = shifts.filter((s) => s.business_date === day.date).length;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDayIndex(idx)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                  idx === selectedDayIndex
                    ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                    : count > 0
                    ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    : 'bg-gray-50 text-gray-400 border-gray-200'
                }`}
              >
                <div className="font-medium leading-tight">{day.dayName}</div>
                <div className="text-[10px] leading-tight opacity-70">{day.dateStr}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-emerald-50 border border-emerald-300" />
          <span>FOH</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-amber-50 border border-amber-300" />
          <span>BOH</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-amber-100 border border-amber-500" />
          <span>Modified</span>
        </div>
      </div>

      {/* Chart area */}
      {dayShifts.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          No shifts scheduled for {selectedDay.dayName} {selectedDay.dateStr}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            {/* Time axis header */}
            <div className="flex border-b border-gray-200 pb-1">
              <div style={{ width: LABEL_WIDTH }} className="shrink-0" />
              <div className="flex-1 relative">
                {hourMarkers.map((h) => {
                  const leftPct = ((h - timelineStart) / totalHours) * 100;
                  return (
                    <span
                      key={h}
                      className="absolute text-[10px] text-gray-400 font-medium -translate-x-1/2"
                      style={{ left: `${leftPct}%` }}
                    >
                      {formatHourLabel(h)}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Position rows */}
            {positionGroups.map(([posName, posShifts]) => {
              const lanes = assignLanes(posShifts);
              const laneCount = Math.max(...lanes.map((l) => l.lane), 0) + 1;
              const rowH = laneCount * ROW_HEIGHT + ROW_PADDING * 2;

              return (
                <div
                  key={posName}
                  className="flex border-b border-gray-100"
                  style={{ height: rowH }}
                >
                  {/* Position label */}
                  <div
                    style={{ width: LABEL_WIDTH }}
                    className="shrink-0 flex items-center px-3 bg-gray-50/60 border-r border-gray-100"
                  >
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {posName}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-400">
                      {posShifts.length}
                    </span>
                  </div>

                  {/* Timeline area */}
                  <div className="flex-1 relative">
                    {/* Gridlines */}
                    {hourMarkers.map((h) => {
                      const leftPct = ((h - timelineStart) / totalHours) * 100;
                      return (
                        <div
                          key={h}
                          className="absolute top-0 bottom-0 border-l border-gray-100"
                          style={{ left: `${leftPct}%` }}
                        />
                      );
                    })}

                    {/* Shift bars */}
                    {lanes.map(({ shift, lane }) => {
                      const pos = getBarPosition(shift);
                      const colors = getBarColors(shift);
                      const empName = shift.employee
                        ? `${shift.employee.first_name} ${shift.employee.last_name[0]}.`
                        : 'TBD';

                      return (
                        <div
                          key={shift.id}
                          className={`absolute rounded border cursor-pointer group transition-shadow
                            ${colors.bg} ${colors.border} ${colors.text} ${colors.hoverBg}
                            hover:shadow-md hover:z-10`}
                          style={{
                            left: pos.left,
                            width: pos.width,
                            top: ROW_PADDING + lane * ROW_HEIGHT,
                            height: BAR_HEIGHT,
                          }}
                          onClick={() => onShiftClick?.(shift)}
                        >
                          {/* Bar content */}
                          <div className="px-1.5 h-full flex items-center overflow-hidden">
                            <span className="text-[10px] font-medium truncate">
                              {empName}
                            </span>
                            <span className="text-[9px] opacity-60 ml-auto shrink-0 hidden sm:inline">
                              {shift.scheduled_hours}h
                            </span>
                          </div>

                          {/* Hover tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                            <div className="bg-gray-900 text-white text-[11px] rounded-md px-2.5 py-2 whitespace-nowrap shadow-xl">
                              <div className="font-semibold">
                                {shift.employee
                                  ? `${shift.employee.first_name} ${shift.employee.last_name}`
                                  : 'Unassigned'}
                              </div>
                              <div className="text-gray-300">{shift.position?.name}</div>
                              <div className="mt-1">
                                {formatTime(shift.scheduled_start)} &ndash;{' '}
                                {formatTime(shift.scheduled_end)}
                                <span className="text-gray-400 ml-1">
                                  ({shift.scheduled_hours}h)
                                </span>
                              </div>
                              {shift.is_modified && (
                                <div className="text-amber-400 mt-0.5 text-[10px]">
                                  Manager modified
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Headcount summary row */}
            <div className="flex" style={{ height: HEADCOUNT_HEIGHT }}>
              <div
                style={{ width: LABEL_WIDTH }}
                className="shrink-0 flex items-center px-3 bg-gray-50/60 border-r border-gray-100"
              >
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  On Floor
                </span>
              </div>
              <div className="flex-1 relative bg-gray-50/30">
                {/* Gridlines */}
                {hourMarkers.map((h) => {
                  const leftPct = ((h - timelineStart) / totalHours) * 100;
                  return (
                    <div
                      key={h}
                      className="absolute top-0 bottom-0 border-l border-gray-100"
                      style={{ left: `${leftPct}%` }}
                    />
                  );
                })}

                {/* Headcount bars */}
                {headcountData.map((point, i) => {
                  const leftPct = ((point.hour - timelineStart) / totalHours) * 100;
                  const widthPct = (0.25 / totalHours) * 100;
                  const heightPct = (point.count / maxHeadcount) * 100;
                  const isPeak = point.count === maxHeadcount && point.count > 0;
                  return (
                    <div
                      key={i}
                      className={`absolute bottom-0 transition-colors ${
                        isPeak
                          ? 'bg-blue-200 border-t border-blue-400'
                          : 'bg-blue-100/70 border-t border-blue-300/60'
                      }`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct + 0.1}%`,
                        height: `${heightPct}%`,
                      }}
                      title={`${formatHourLabel(point.hour)}: ${point.count} staff`}
                    />
                  );
                })}

                {/* Peak annotation */}
                {peakPoint && peakPoint.count > 0 && (
                  <div
                    className="absolute text-[10px] font-semibold text-blue-600"
                    style={{
                      left: `${((peakPoint.hour - timelineStart) / totalHours) * 100}%`,
                      top: 2,
                    }}
                  >
                    {maxHeadcount}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
