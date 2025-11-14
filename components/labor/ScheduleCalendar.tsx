'use client';

/**
 * Schedule Calendar Component
 * Weekly calendar view like 7shifts
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Send,
  Lock,
  Unlock,
  Edit3,
  GitCompare,
} from 'lucide-react';

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
  employee: {
    id: string;
    first_name: string;
    last_name: string;
  };
  position: {
    id: string;
    name: string;
    category: string;
    base_hourly_rate: number;
  };
}

interface Schedule {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: 'draft' | 'published' | 'locked';
  total_labor_hours: number;
  total_labor_cost: number;
  shifts: Shift[];
}

interface Props {
  schedule: Schedule | null;
  venueId: string;
  weekStart: string;
}

export function ScheduleCalendar({ schedule, venueId, weekStart }: Props) {
  const [generating, setGenerating] = useState(false);
  const [publishingStatus, setPublishingStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'manual'>('view');
  const [manualShifts, setManualShifts] = useState<Shift[]>(schedule?.shifts || []);
  const [comparing, setComparing] = useState(false);
  const [comparisonData, setComparisonData] = useState<any>(null);

  // Generate week days
  const weekDays = getWeekDays(weekStart);

  // Use manual shifts when in manual mode, otherwise use schedule shifts
  const activeShifts = mode === 'manual' ? manualShifts : (schedule?.shifts || []);

  // Group shifts by date and position
  const shiftsByDate = activeShifts.reduce((acc: any, shift) => {
    const date = shift.business_date;
    if (!acc[date]) acc[date] = {};
    const position = shift.position.name;
    if (!acc[date][position]) acc[date][position] = [];
    acc[date][position].push(shift);
    return acc;
  }, {});

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
        window.location.reload();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Generate error:', error);
      alert('Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!schedule) return;

    setPublishingStatus('publishing');
    try {
      const response = await fetch('/api/labor/schedule/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: schedule.id,
          status: 'published',
        }),
      });

      const data = await response.json();

      if (data.schedule) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Publish error:', error);
      alert('Failed to publish schedule');
    } finally {
      setPublishingStatus(null);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = new Date(weekStart);
    const newDate = new Date(current);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    const newWeekStart = newDate.toISOString().split('T')[0];
    window.location.href = `/labor/schedule?week=${newWeekStart}`;
  };

  const handleCompare = async () => {
    setComparing(true);
    try {
      // Generate auto schedule without saving
      const response = await fetch('/api/labor/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          week_start_date: weekStart,
          save: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Calculate comparison metrics
        const manualCost = manualShifts.reduce((sum, s) =>
          sum + (s.scheduled_hours * s.position.base_hourly_rate), 0);
        const manualHours = manualShifts.reduce((sum, s) => sum + s.scheduled_hours, 0);

        const autoCost = data.schedule.total_labor_cost;
        const autoHours = data.schedule.total_labor_hours;

        setComparisonData({
          manual: { cost: manualCost, hours: manualHours, shifts: manualShifts.length },
          auto: { cost: autoCost, hours: autoHours, shifts: data.schedule.shifts.length },
          savings: { cost: manualCost - autoCost, hours: manualHours - autoHours },
        });
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Compare error:', error);
      alert('Failed to generate comparison');
    } finally {
      setComparing(false);
    }
  };

  const toggleMode = () => {
    if (mode === 'view') {
      setMode('manual');
      setManualShifts(schedule?.shifts || []);
    } else {
      setMode('view');
      setComparisonData(null);
    }
  };

  if (!schedule) {
    return (
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
    );
  }

  // Get unique positions
  const positions = Array.from(
    new Set(schedule.shifts.map((s) => s.position.name))
  ).sort();

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek('prev')}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-medium px-3">
                {formatWeekRange(weekStart)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek('next')}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
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

            {/* Summary */}
            <div className="text-sm text-gray-600">
              {schedule.shifts.length} shifts • {schedule.total_labor_hours}h •
              ${schedule.total_labor_cost.toFixed(0)}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant={mode === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={toggleMode}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              {mode === 'manual' ? 'Exit Manual' : 'Manual Mode'}
            </Button>
            {mode === 'manual' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompare}
                disabled={comparing}
              >
                <GitCompare className="w-4 h-4 mr-2" />
                {comparing ? 'Comparing...' : 'Compare vs Auto'}
              </Button>
            )}
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            {schedule.status === 'draft' && mode === 'view' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSchedule}
                  disabled={generating}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={!!publishingStatus}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Comparison Panel */}
      {comparisonData && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <GitCompare className="w-5 h-5 mr-2" />
            Manual vs Auto-Generated Comparison
          </h3>
          <div className="grid grid-cols-3 gap-6">
            {/* Manual Schedule */}
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Your Manual Schedule</div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-gray-900">
                  ${comparisonData.manual.cost.toFixed(0)}
                </div>
                <div className="text-sm text-gray-600">
                  {comparisonData.manual.hours.toFixed(1)}h • {comparisonData.manual.shifts} shifts
                </div>
              </div>
            </div>

            {/* Auto Schedule */}
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Auto-Generated Schedule</div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-green-600">
                  ${comparisonData.auto.cost.toFixed(0)}
                </div>
                <div className="text-sm text-gray-600">
                  {comparisonData.auto.hours.toFixed(1)}h • {comparisonData.auto.shifts} shifts
                </div>
              </div>
            </div>

            {/* Savings */}
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Potential Savings</div>
              <div className="space-y-1">
                <div className={`text-2xl font-bold ${comparisonData.savings.cost > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {comparisonData.savings.cost > 0 ? '-' : '+'}${Math.abs(comparisonData.savings.cost).toFixed(0)}
                </div>
                <div className="text-sm text-gray-600">
                  {comparisonData.savings.hours > 0 ? '-' : '+'}{Math.abs(comparisonData.savings.hours).toFixed(1)}h
                </div>
              </div>
            </div>
          </div>
          {comparisonData.savings.cost > 0 && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-md">
              <p className="text-sm text-green-800">
                💡 The auto-generated schedule could save you <strong>${comparisonData.savings.cost.toFixed(0)}</strong> this week while maintaining coverage requirements.
              </p>
            </div>
          )}
          {comparisonData.savings.cost < 0 && (
            <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-md">
              <p className="text-sm text-yellow-800">
                ℹ️ Your manual schedule is more efficient than the auto-generated version by <strong>${Math.abs(comparisonData.savings.cost).toFixed(0)}</strong>.
              </p>
            </div>
          )}
        </Card>
      )}

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
                        className="text-xs p-2 bg-opsos-sage-100 border border-opsos-sage-300 rounded hover:bg-opsos-sage-200 cursor-pointer transition-colors"
                      >
                        <div className="font-medium text-gray-900">
                          {shift.employee.first_name} {shift.employee.last_name[0]}.
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
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Open Shifts Row */}
        <div className="grid grid-cols-8 bg-gray-100">
          <div className="p-3 border-r">
            <div className="text-sm font-medium text-gray-600">Open Shifts</div>
          </div>
          {weekDays.map((day, idx) => (
            <div key={idx} className="p-2 border-l min-h-[60px]">
              {/* Show open shifts if any */}
            </div>
          ))}
        </div>
      </div>
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

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
