'use client';

/**
 * Employee Schedule View
 * Employee-centric weekly schedule — one row per person, shift blocks per day.
 * Designed to be easy for employees to read their own schedule at a glance.
 */

import { useMemo } from 'react';
import { Clock, Coffee, Moon, Sun, Calendar } from 'lucide-react';

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
  employee: { id?: string; first_name: string; last_name: string } | null;
  position: { id?: string; name: string; category?: string; base_hourly_rate: number } | null;
}

interface WeekDay {
  date: string;
  dayName: string;
  dateStr: string;
}

interface Props {
  shifts: Shift[];
  weekDays: WeekDay[];
  isLocked?: boolean;
}

// Color palette per position category / role name
function getShiftColor(shift: Shift): { bg: string; border: string; text: string; dot: string } {
  const cat = shift.position?.category || '';
  const name = (shift.position?.name || '').toLowerCase();

  if (name.includes('general manager') || name.includes('assistant manager')) {
    return { bg: 'bg-emerald-500', border: 'border-emerald-600', text: 'text-white', dot: 'bg-emerald-300' };
  }
  if (name.includes('manager') || cat === 'management') {
    return { bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-white', dot: 'bg-emerald-200' };
  }
  if (name.includes('bartender') || name.includes('barback')) {
    return { bg: 'bg-violet-500', border: 'border-violet-600', text: 'text-white', dot: 'bg-violet-300' };
  }
  if (name.includes('server') || name.includes('food runner') || name.includes('runner')) {
    return { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white', dot: 'bg-blue-300' };
  }
  if (name.includes('host') || name.includes('busser')) {
    return { bg: 'bg-sky-400', border: 'border-sky-500', text: 'text-white', dot: 'bg-sky-200' };
  }
  if (name.includes('chef') || name.includes('sous')) {
    return { bg: 'bg-rose-500', border: 'border-rose-600', text: 'text-white', dot: 'bg-rose-300' };
  }
  if (name.includes('cook') || name.includes('kitchen') || cat === 'back_of_house') {
    return { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-white', dot: 'bg-orange-300' };
  }
  // Default FOH
  return { bg: 'bg-indigo-400', border: 'border-indigo-500', text: 'text-white', dot: 'bg-indigo-200' };
}

function getShiftIcon(shift: Shift) {
  const start = shift.scheduled_start;
  if (!start) return <Clock className="w-2.5 h-2.5" />;
  const hour = parseInt(start.split('T')[1]?.split(':')[0] ?? start.split(':')[0] ?? '12', 10);
  if (hour < 11) return <Sun className="w-2.5 h-2.5" />;
  if (hour < 17) return <Coffee className="w-2.5 h-2.5" />;
  return <Moon className="w-2.5 h-2.5" />;
}

function formatShiftTime(isoOrTime: string): string {
  if (!isoOrTime) return '';
  // Could be "2026-01-01T18:30:00" or "18:30:00" or "18:30"
  const timePart = isoOrTime.includes('T') ? isoOrTime.split('T')[1] : isoOrTime;
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

// Deterministic avatar color from name
const AVATAR_COLORS = [
  'bg-rose-400', 'bg-pink-400', 'bg-fuchsia-400', 'bg-purple-400',
  'bg-violet-400', 'bg-indigo-400', 'bg-blue-400', 'bg-sky-400',
  'bg-cyan-400', 'bg-teal-400', 'bg-emerald-400', 'bg-green-400',
  'bg-lime-400', 'bg-yellow-400', 'bg-amber-400', 'bg-orange-400',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function EmployeeScheduleView({ shifts, weekDays, isLocked = false }: Props) {
  // Build employee list sorted by: management → FOH → BOH, then name
  const employees = useMemo(() => {
    const map = new Map<string, {
      id: string; firstName: string; lastName: string;
      category: string; positionName: string; totalHours: number;
    }>();

    for (const s of shifts) {
      if (!s.employee) continue;
      const key = s.employee_id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          firstName: s.employee.first_name,
          lastName: s.employee.last_name,
          category: s.position?.category || 'other',
          positionName: s.position?.name || '',
          totalHours: 0,
        });
      }
      map.get(key)!.totalHours += s.scheduled_hours;
    }

    const catOrder: Record<string, number> = { management: 0, front_of_house: 1, back_of_house: 2, other: 3 };
    return Array.from(map.values()).sort((a, b) => {
      const catDiff = (catOrder[a.category] ?? 3) - (catOrder[b.category] ?? 3);
      if (catDiff !== 0) return catDiff;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [shifts]);

  // Index shifts by employee + date
  const shiftIndex = useMemo(() => {
    const idx: Record<string, Record<string, Shift[]>> = {};
    for (const s of shifts) {
      if (!s.employee_id) continue;
      if (!idx[s.employee_id]) idx[s.employee_id] = {};
      const date = s.business_date;
      if (!idx[s.employee_id][date]) idx[s.employee_id][date] = [];
      idx[s.employee_id][date].push(s);
    }
    return idx;
  }, [shifts]);

  // Weekly totals per day
  const dayTotals = useMemo(() =>
    weekDays.map(day => ({
      ...day,
      staffCount: new Set(shifts.filter(s => s.business_date === day.date).map(s => s.employee_id)).size,
      shiftCount: shifts.filter(s => s.business_date === day.date).length,
    })), [shifts, weekDays]);

  const isWeekend = (dayName: string) => ['Sat', 'Sun'].includes(dayName);
  const isToday = (date: string) => new Date().toISOString().split('T')[0] === date;

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <Calendar className="w-10 h-10" />
        <p className="text-sm">No employee shifts to display.</p>
      </div>
    );
  }

  // Group employees by category for section headers
  const sections: { label: string; cat: string; color: string }[] = [
    { label: 'Management', cat: 'management', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { label: 'Front of House', cat: 'front_of_house', color: 'bg-blue-50 text-blue-800 border-blue-200' },
    { label: 'Back of House', cat: 'back_of_house', color: 'bg-orange-50 text-orange-800 border-orange-200' },
    { label: 'Other', cat: 'other', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* === Column headers === */}
      <div
        className="grid border-b bg-gray-50"
        style={{ gridTemplateColumns: `240px repeat(${weekDays.length}, 1fr)` }}
      >
        {/* Employee header */}
        <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-200 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          Employee
        </div>

        {/* Day headers */}
        {dayTotals.map((day) => (
          <div
            key={day.date}
            className={`px-2 py-3 text-center border-r border-gray-200 last:border-r-0 ${
              isToday(day.date) ? 'bg-indigo-50' : isWeekend(day.dayName) ? 'bg-amber-50/60' : ''
            }`}
          >
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              isToday(day.date) ? 'text-indigo-600' : isWeekend(day.dayName) ? 'text-amber-700' : 'text-gray-500'
            }`}>
              {day.dayName}
            </div>
            <div className={`text-sm font-bold mt-0.5 ${
              isToday(day.date) ? 'text-indigo-700' : 'text-gray-800'
            }`}>
              {day.dateStr}
            </div>
            {day.staffCount > 0 && (
              <div className="mt-1 text-[10px] text-gray-400">
                {day.staffCount} staff
              </div>
            )}
            {isToday(day.date) && (
              <div className="mt-1 mx-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />
            )}
          </div>
        ))}
      </div>

      {/* === Employee rows, grouped by category === */}
      {sections.map(({ label, cat, color }) => {
        const sectionEmployees = employees.filter(e => e.category === cat);
        if (sectionEmployees.length === 0) return null;

        return (
          <div key={cat}>
            {/* Section header */}
            <div
              className={`grid border-b ${color}`}
              style={{ gridTemplateColumns: `240px repeat(${weekDays.length}, 1fr)` }}
            >
              <div className={`col-span-${weekDays.length + 1} px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider border-r-0`}
                style={{ gridColumn: `1 / span ${weekDays.length + 1}` }}>
                {label} · {sectionEmployees.length} staff
              </div>
            </div>

            {/* Employee rows */}
            {sectionEmployees.map((emp, empIdx) => {
              const empShifts = shiftIndex[emp.id] || {};
              const weeklyHours = Math.round(emp.totalHours * 10) / 10;
              const initials = getInitials(emp.firstName, emp.lastName);
              const avatarBg = avatarColor(`${emp.firstName}${emp.lastName}`);

              return (
                <div
                  key={emp.id}
                  className={`grid border-b border-gray-100 hover:bg-gray-50/70 transition-colors group ${
                    empIdx % 2 === 0 ? '' : 'bg-gray-50/30'
                  }`}
                  style={{ gridTemplateColumns: `240px repeat(${weekDays.length}, 1fr)` }}
                >
                  {/* Employee identity cell */}
                  <div className="px-3 py-2.5 border-r border-gray-200 flex items-center gap-2.5 min-h-[72px]">
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{emp.positionName}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-gray-400" />
                        <span className="text-[10px] text-gray-400">{weeklyHours}h this week</span>
                      </div>
                    </div>
                  </div>

                  {/* Day cells */}
                  {weekDays.map((day) => {
                    const dayShifts = empShifts[day.date] || [];
                    const hasShift = dayShifts.length > 0;

                    return (
                      <div
                        key={day.date}
                        className={`px-1.5 py-2 border-r border-gray-100 last:border-r-0 flex flex-col gap-1 min-h-[72px] ${
                          isToday(day.date) ? 'bg-indigo-50/40' :
                          isWeekend(day.dayName) ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        {hasShift ? (
                          dayShifts.map((shift) => {
                            const colors = getShiftColor(shift);
                            return (
                              <div
                                key={shift.id}
                                title={`${shift.position?.name} · ${formatShiftTime(shift.scheduled_start)} – ${formatShiftTime(shift.scheduled_end)} (${shift.scheduled_hours}h)`}
                                className={`
                                  ${colors.bg} ${colors.text}
                                  rounded-md px-2 py-1.5 text-[11px] leading-snug
                                  border-l-2 ${colors.border}
                                  shadow-sm
                                  ${shift.is_modified ? 'ring-1 ring-amber-400 ring-offset-1' : ''}
                                `}
                              >
                                <div className="flex items-center gap-1 font-semibold">
                                  {getShiftIcon(shift)}
                                  <span className="truncate">{shift.position?.name}</span>
                                </div>
                                <div className="mt-0.5 opacity-90 font-medium">
                                  {formatShiftTime(shift.scheduled_start)}–{formatShiftTime(shift.scheduled_end)}
                                </div>
                                <div className="opacity-75 text-[10px]">
                                  {shift.scheduled_hours}h
                                  {shift.is_modified && <span className="ml-1 text-amber-200">✎</span>}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          /* Off day — subtle indicator */
                          <div className="flex-1 flex items-center justify-center">
                            <span className="text-[10px] text-gray-300 font-medium">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* === Footer — weekly summary bar === */}
      <div
        className="grid border-t bg-gray-50 text-xs"
        style={{ gridTemplateColumns: `240px repeat(${weekDays.length}, 1fr)` }}
      >
        <div className="px-4 py-2.5 border-r border-gray-200 font-semibold text-gray-600">
          Weekly Total
        </div>
        {dayTotals.map((day) => (
          <div
            key={day.date}
            className={`px-2 py-2.5 text-center border-r border-gray-200 last:border-r-0 ${
              isToday(day.date) ? 'bg-indigo-50' : ''
            }`}
          >
            {day.shiftCount > 0 ? (
              <>
                <div className="font-bold text-gray-800">{day.shiftCount}</div>
                <div className="text-gray-400">shifts</div>
              </>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
