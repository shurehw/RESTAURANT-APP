'use client';

/**
 * Schedule Calendar Component
 * Weekly calendar view with manager override, approval workflow, and export
 */

import { useState, useEffect } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  CheckCircle,
  Lock,
  Edit3,
  AlertCircle,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ShiftEditDialog } from './ShiftEditDialog';
import { AddShiftDialog } from './AddShiftDialog';
import { ScheduleChangeLog } from './ScheduleChangeLog';

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
  modification_reason?: string;
  employee: {
    id?: string;
    first_name: string;
    last_name: string;
  } | null;
  position: {
    id?: string;
    name: string;
    category?: string;
    base_hourly_rate: number;
  } | null;
}

interface Schedule {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: 'draft' | 'published' | 'locked';
  total_labor_hours: number;
  total_labor_cost: number;
  auto_generated?: boolean;
  labor_percentage?: number;
  overall_cplh?: number;
  service_quality_score?: number;
  projected_revenue?: number;
  optimization_mode?: string;
  shifts: Shift[];
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  primary_position_id: string;
}

interface PositionInfo {
  id: string;
  name: string;
  category?: string;
  base_hourly_rate: number;
}

interface Props {
  schedule: Schedule | null;
  venueId: string;
  weekStart: string;
}

export function ScheduleCalendar({ schedule, venueId: fallbackVenueId, weekStart }: Props) {
  const { selectedVenue } = useVenue();
  const venueId = selectedVenue?.id || fallbackVenueId;
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Edit dialog state
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Add shift dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogDate, setAddDialogDate] = useState('');

  // Employee data for dialogs
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positionsList, setPositionsList] = useState<PositionInfo[]>([]);

  // Generate week days
  const weekDays = getWeekDays(weekStart);

  // Active shifts (filter cancelled)
  const activeShifts = (schedule?.shifts || []).filter(s => s.status !== 'cancelled');

  // Count modifications
  const modifiedCount = activeShifts.filter(s => s.is_modified).length;

  // Group shifts by date and position
  const shiftsByDate = activeShifts.reduce((acc: any, shift) => {
    const date = shift.business_date;
    if (!acc[date]) acc[date] = {};
    const position = shift.position?.name || 'Unknown';
    if (!acc[date][position]) acc[date][position] = [];
    acc[date][position].push(shift);
    return acc;
  }, {});

  // Load employees for edit/add dialogs
  useEffect(() => {
    if (schedule) {
      loadEmployeesAndPositions();
    }
  }, [schedule?.id]);

  const loadEmployeesAndPositions = async () => {
    try {
      const [empRes, posRes] = await Promise.all([
        fetch(`/api/labor/schedule/shifts?employees=true&venue_id=${venueId}`),
        fetch(`/api/labor/schedule/shifts?positions=true&venue_id=${venueId}`),
      ]);
      if (empRes.ok) {
        const data = await empRes.json();
        if (data.employees) setEmployees(data.employees);
      }
      if (posRes.ok) {
        const data = await posRes.json();
        if (data.positions) setPositionsList(data.positions);
      }
    } catch {
      // Fallback: extract from schedule shifts
      const empMap = new Map<string, Employee>();
      const posMap = new Map<string, PositionInfo>();
      for (const s of schedule?.shifts || []) {
        if (s.employee) {
          empMap.set(s.employee_id, {
            id: s.employee_id,
            first_name: s.employee.first_name,
            last_name: s.employee.last_name,
            primary_position_id: s.position_id,
          });
        }
        if (s.position) {
          posMap.set(s.position_id, {
            id: s.position_id,
            name: s.position.name,
            category: s.position.category,
            base_hourly_rate: s.position.base_hourly_rate,
          });
        }
      }
      setEmployees(Array.from(empMap.values()));
      setPositionsList(Array.from(posMap.values()));
    }
  };

  const handleGenerateSchedule = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/labor/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          week_start_date: weekStart,
          save: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Schedule generated');
        window.location.reload();
      } else {
        toast.error(data.message || data.error || 'Schedule generation failed');
      }
    } catch (error) {
      console.error('Generate error:', error);
      toast.error('Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveAndPublish = async () => {
    if (!schedule) return;

    setApproving(true);
    try {
      const response = await fetch('/api/labor/schedule/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: schedule.id,
          approval_notes: modifiedCount > 0
            ? `Approved with ${modifiedCount} manual modification(s)`
            : 'Approved as generated',
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Schedule approved and published (${data.changes_count || 0} changes tracked)`);
        window.location.reload();
      } else {
        toast.error(data.message || 'Approval failed');
      }
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('Failed to approve schedule');
    } finally {
      setApproving(false);
    }
  };

  const handleExport = async () => {
    if (!schedule) return;

    setExporting(true);
    try {
      const response = await fetch(`/api/labor/schedule/export?schedule_id=${schedule.id}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        toast.error(errData.message || 'Export failed');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('content-disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || `schedule-${weekStart}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Schedule exported');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export schedule');
    } finally {
      setExporting(false);
    }
  };

  const handleShiftClick = (shift: Shift) => {
    if (schedule?.status === 'locked') return;
    setEditingShift(shift);
    setEditDialogOpen(true);
  };

  const handleAddShift = (date: string) => {
    if (schedule?.status === 'locked') return;
    setAddDialogDate(date);
    setAddDialogOpen(true);
  };

  const handleShiftSaved = () => {
    // Reload to get fresh data
    window.location.reload();
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = new Date(weekStart);
    const newDate = new Date(current);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    const newWeekStart = newDate.toISOString().split('T')[0];
    window.location.href = `/labor/schedule?week=${newWeekStart}`;
  };

  // --- No schedule state ---
  if (!schedule) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium">{formatWeekRange(weekStart)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <input
              type="date"
              className="ml-4 border rounded px-2 py-1 text-sm"
              value={weekStart}
              onChange={(e) => {
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  const day = d.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  d.setDate(d.getDate() + diff);
                  window.location.href = `/labor/schedule?week=${d.toISOString().split('T')[0]}`;
                }
              }}
            />
          </div>
        </Card>

        <Card className="p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No Schedule Generated
          </h3>
          <p className="text-gray-600 mb-6">
            Generate an optimized schedule for the week of {formatDate(weekStart)}
          </p>
          <Button onClick={handleGenerateSchedule} disabled={generating} size="lg">
            <Plus className="w-5 h-5 mr-2" />
            {generating ? 'Generating...' : 'Generate Schedule'}
          </Button>
        </Card>
      </div>
    );
  }

  // --- Get unique positions ---
  const positions = Array.from(
    new Set(activeShifts.map((s) => s.position?.name || 'Unknown'))
  ).sort();

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-medium px-3">
                {formatWeekRange(weekStart)}
              </div>
              <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={weekStart}
                onChange={(e) => {
                  if (e.target.value) {
                    const d = new Date(e.target.value);
                    const day = d.getDay();
                    const diff = day === 0 ? -6 : 1 - day;
                    d.setDate(d.getDate() + diff);
                    window.location.href = `/labor/schedule?week=${d.toISOString().split('T')[0]}`;
                  }
                }}
              />
            </div>

            {/* Status Badge */}
            <Badge
              variant={
                schedule.status === 'published'
                  ? 'default'
                  : schedule.status === 'locked'
                  ? 'sage'
                  : 'outline'
              }
              className="capitalize"
            >
              {schedule.status === 'published' && <Lock className="w-3 h-3 mr-1" />}
              {schedule.status}
            </Badge>

            {/* Modification count */}
            {modifiedCount > 0 && (
              <Badge variant="brass" className="text-xs">
                <Edit3 className="w-3 h-3 mr-1" />
                {modifiedCount} change{modifiedCount !== 1 ? 's' : ''}
              </Badge>
            )}

            {/* Summary */}
            <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
              <span>{activeShifts.length} shifts</span>
              <span className="text-gray-300">|</span>
              <span>{schedule.total_labor_hours ?? 0}h</span>
              <span className="text-gray-300">|</span>
              <span>${(schedule.total_labor_cost ?? 0).toLocaleString()}</span>
              {schedule.overall_cplh ? (
                <>
                  <span className="text-gray-300">|</span>
                  <span title="Covers Per Labor Hour">CPLH {schedule.overall_cplh}</span>
                </>
              ) : null}
              {schedule.projected_revenue ? (
                <>
                  <span className="text-gray-300">|</span>
                  <span title="Projected Revenue">Rev ${(schedule.projected_revenue).toLocaleString()}</span>
                </>
              ) : null}
              {schedule.service_quality_score != null ? (
                <>
                  <span className="text-gray-300">|</span>
                  <span title="Service Quality Score">
                    Quality {(schedule.service_quality_score * 100).toFixed(0)}%
                  </span>
                </>
              ) : null}
              {schedule.optimization_mode === 'smart' && (
                <Badge variant="sage" className="text-xs">AI-Optimized</Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            {schedule.status === 'draft' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSchedule}
                  disabled={generating}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {generating ? 'Generating...' : 'Regenerate'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleApproveAndPublish}
                  disabled={approving}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {approving ? 'Approving...' : 'Approve & Publish'}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Info banner for draft schedules */}
      {schedule.status === 'draft' && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            This schedule is a <strong>draft</strong>. Click any shift to edit it, or use the + button to add shifts.
            When ready, click <strong>Approve & Publish</strong> to finalize. All changes are tracked.
          </span>
        </div>
      )}

      {/* Covers Projection */}
      <CoversProjection shifts={activeShifts} weekDays={weekDays} schedule={schedule} />

      {/* Calendar Grid */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {/* Header Row - Days */}
        <div className="grid grid-cols-8 border-b bg-gray-50">
          <div className="p-3 text-sm font-medium text-gray-600">Position</div>
          {weekDays.map((day, idx) => (
            <div key={idx} className="p-3 text-center border-l">
              <div className="text-xs text-gray-500">{day.dayName}</div>
              <div className="text-sm font-semibold text-gray-900">
                {day.dateStr}
              </div>
            </div>
          ))}
        </div>

        {/* Rows - Positions */}
        {positions.map((position, pidx) => (
          <div key={pidx} className="grid grid-cols-8 border-b hover:bg-gray-50">
            {/* Position Name */}
            <div className="p-3 border-r bg-gray-50">
              <div className="text-sm font-medium text-gray-900">{position}</div>
            </div>

            {/* Cells - Days */}
            {weekDays.map((day, didx) => {
              const dayShifts = shiftsByDate[day.date]?.[position] || [];

              return (
                <div key={didx} className="p-2 border-l min-h-[80px]">
                  <div className="space-y-1">
                    {dayShifts.map((shift: Shift) => (
                      <div
                        key={shift.id}
                        onClick={() => handleShiftClick(shift)}
                        className={`text-xs p-2 rounded cursor-pointer transition-colors border ${
                          shift.is_modified
                            ? 'bg-amber-50 border-amber-300 hover:bg-amber-100 border-l-4 border-l-amber-500'
                            : 'bg-opsos-sage-100 border-opsos-sage-300 hover:bg-opsos-sage-200'
                        }`}
                      >
                        <div className="font-medium text-gray-900">
                          {shift.employee ? `${shift.employee.first_name} ${shift.employee.last_name[0]}.` : 'Unassigned'}
                        </div>
                        <div className="text-gray-600">
                          {formatTime(shift.scheduled_start)} -{' '}
                          {formatTime(shift.scheduled_end)}
                        </div>
                        <div className="text-gray-500">
                          {shift.scheduled_hours}h
                        </div>
                      </div>
                    ))}

                    {/* Add shift button */}
                    {schedule.status === 'draft' && (
                      <button
                        onClick={() => handleAddShift(day.date)}
                        className="w-full p-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded border border-dashed border-gray-200 hover:border-gray-400 transition-colors"
                      >
                        <Plus className="w-3 h-3 mx-auto" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Add position row for draft - shows + in all cells */}
        {schedule.status === 'draft' && positions.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">
            No shifts yet. Click + on any day cell to add shifts.
          </div>
        )}
      </div>

      {/* Change Log */}
      <ScheduleChangeLog venueId={venueId} weekStart={weekStart} />

      {/* Edit Dialog */}
      <ShiftEditDialog
        shift={editingShift}
        employees={employees}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={handleShiftSaved}
      />

      {/* Add Shift Dialog */}
      {schedule && (
        <AddShiftDialog
          scheduleId={schedule.id}
          date={addDialogDate}
          positions={positionsList}
          employees={employees}
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onSaved={handleShiftSaved}
        />
      )}
    </div>
  );
}

function getWeekDays(weekStart: string) {
  const start = new Date(weekStart);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    days.push({
      date: date.toISOString().split('T')[0],
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateStr: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  return days;
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Server CPLH used by the scheduler (dinner period)
const SERVER_CPLH = 18.0;

function CoversProjection({
  shifts,
  weekDays,
  schedule,
}: {
  shifts: Shift[];
  weekDays: { date: string; dayName: string; dateStr: string }[];
  schedule: Schedule;
}) {
  // Compute per-day stats from shift data
  const dailyStats = weekDays.map((day) => {
    const dayShifts = shifts.filter((s) => s.business_date === day.date);
    const serverShifts = dayShifts.filter((s) => s.position?.name === 'Server');
    const bartenderShifts = dayShifts.filter((s) => s.position?.name === 'Bartender');
    const fohShifts = dayShifts.filter((s) => s.position?.category === 'front_of_house');
    const bohShifts = dayShifts.filter((s) => s.position?.category === 'back_of_house');
    const mgtShifts = dayShifts.filter((s) => s.position?.category === 'management');

    const serverHours = serverShifts.reduce((sum, s) => sum + s.scheduled_hours, 0);
    const projectedCovers = Math.round(serverHours * SERVER_CPLH);

    return {
      date: day.date,
      dayName: day.dayName,
      dateStr: day.dateStr,
      projectedCovers,
      serverCount: serverShifts.length,
      bartenderCount: bartenderShifts.length,
      fohCount: fohShifts.length,
      bohCount: bohShifts.length,
      mgtCount: mgtShifts.length,
      totalStaff: dayShifts.length,
      totalHours: dayShifts.reduce((sum, s) => sum + s.scheduled_hours, 0),
    };
  });

  const totalCovers = dailyStats.reduce((sum, d) => sum + d.projectedCovers, 0);
  const totalStaff = dailyStats.reduce((sum, d) => sum + d.totalStaff, 0);
  const peakDay = dailyStats.reduce((max, d) => (d.projectedCovers > max.projectedCovers ? d : max), dailyStats[0]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">Covers Projection & Staffing</h3>
        <span className="text-xs text-gray-500 ml-auto">
          Based on POS data (server_day_facts P75+10%) | CPLH {SERVER_CPLH}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-2 text-gray-600 font-medium w-36"></th>
              {dailyStats.map((d, i) => (
                <th key={i} className="text-center p-2 text-gray-600 font-medium">
                  <div className="text-xs">{d.dayName}</div>
                  <div className="text-xs text-gray-400">{d.dateStr}</div>
                </th>
              ))}
              <th className="text-center p-2 text-gray-700 font-semibold bg-gray-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* Projected Covers */}
            <tr className="border-b">
              <td className="p-2 font-medium text-gray-900 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                Projected Covers
              </td>
              {dailyStats.map((d, i) => (
                <td key={i} className={`text-center p-2 font-semibold ${
                  d.projectedCovers === 0 ? 'text-gray-300' :
                  d.projectedCovers >= 500 ? 'text-red-600' :
                  d.projectedCovers >= 300 ? 'text-amber-600' : 'text-gray-900'
                }`}>
                  {d.projectedCovers === 0 ? 'Closed' : d.projectedCovers.toLocaleString()}
                </td>
              ))}
              <td className="text-center p-2 font-bold text-gray-900 bg-gray-50">
                {totalCovers.toLocaleString()}
              </td>
            </tr>

            {/* Server count */}
            <tr className="border-b">
              <td className="p-2 text-gray-700 flex items-center gap-1">
                <Users className="w-3 h-3 text-blue-500" />
                Servers
              </td>
              {dailyStats.map((d, i) => (
                <td key={i} className={`text-center p-2 ${d.serverCount === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                  {d.serverCount || '-'}
                </td>
              ))}
              <td className="text-center p-2 text-gray-600 bg-gray-50">-</td>
            </tr>

            {/* Bartender count */}
            <tr className="border-b">
              <td className="p-2 text-gray-700 pl-6">Bartenders</td>
              {dailyStats.map((d, i) => (
                <td key={i} className={`text-center p-2 ${d.bartenderCount === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                  {d.bartenderCount || '-'}
                </td>
              ))}
              <td className="text-center p-2 text-gray-600 bg-gray-50">-</td>
            </tr>

            {/* FOH total */}
            <tr className="border-b">
              <td className="p-2 text-gray-700 pl-6">FOH Total</td>
              {dailyStats.map((d, i) => (
                <td key={i} className={`text-center p-2 ${d.fohCount === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                  {d.fohCount || '-'}
                </td>
              ))}
              <td className="text-center p-2 text-gray-600 bg-gray-50">-</td>
            </tr>

            {/* BOH total */}
            <tr className="border-b">
              <td className="p-2 text-gray-700 pl-6">BOH Total</td>
              {dailyStats.map((d, i) => (
                <td key={i} className={`text-center p-2 ${d.bohCount === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                  {d.bohCount || '-'}
                </td>
              ))}
              <td className="text-center p-2 text-gray-600 bg-gray-50">-</td>
            </tr>

            {/* Total staff */}
            <tr className="bg-gray-50">
              <td className="p-2 font-medium text-gray-900">Total Staff</td>
              {dailyStats.map((d, i) => (
                <td key={i} className={`text-center p-2 font-semibold ${d.totalStaff === 0 ? 'text-gray-300' : 'text-gray-900'}`}>
                  {d.totalStaff || '-'}
                </td>
              ))}
              <td className="text-center p-2 font-bold text-gray-900">{totalStaff}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
        <span>Peak: <strong className="text-gray-700">{peakDay.dayName} {peakDay.dateStr}</strong> ({peakDay.projectedCovers} covers, {peakDay.totalStaff} staff)</span>
        <span>Weekly Rev: <strong className="text-gray-700">${(schedule.projected_revenue || 0).toLocaleString()}</strong></span>
        <span>Labor: <strong className="text-gray-700">${(schedule.total_labor_cost || 0).toLocaleString()}</strong> ({schedule.total_labor_hours || 0}h)</span>
        <span>Labor%: <strong className="text-gray-700">{schedule.projected_revenue ? ((schedule.total_labor_cost / schedule.projected_revenue) * 100).toFixed(1) : '—'}%</strong></span>
      </div>
    </Card>
  );
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  // Handle ISO timestamps like "2026-02-09T17:00:00+00:00"
  // Use UTC getters because the scheduler stores local venue times as UTC
  if (timeStr.includes('T')) {
    const date = new Date(timeStr);
    let hour = date.getUTCHours();
    const minute = date.getUTCMinutes().toString().padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
  }
  // Handle TIME values like "16:00:00" or "16:00"
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
