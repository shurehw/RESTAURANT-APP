'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coffee, Clock, PlayCircle, StopCircle } from 'lucide-react';

interface Break {
  id: string;
  break_type: string;
  break_start: string;
  break_end: string | null;
  break_duration_minutes: number | null;
}

export function BreakTracking({
  employeeId,
  venueId,
}: {
  employeeId: string;
  venueId: string;
}) {
  const [breakStatus, setBreakStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBreakStatus();
    // Refresh every 30 seconds
    const interval = setInterval(loadBreakStatus, 30000);
    return () => clearInterval(interval);
  }, [employeeId]);

  const loadBreakStatus = async () => {
    try {
      const response = await fetch(
        `/api/timeclock/breaks?employee_id=${employeeId}`
      );
      const data = await response.json();

      if (data.success) {
        setBreakStatus(data);
      }
    } catch (error) {
      console.error('Error loading break status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBreakAction = async (breakType: string, action: 'start' | 'end') => {
    setActionLoading(true);

    try {
      const response = await fetch('/api/timeclock/breaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          venue_id: venueId,
          break_type: breakType,
          action,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        loadBreakStatus();
      } else {
        alert(result.error || 'Failed to manage break');
      }
    } catch (error) {
      console.error('Error managing break:', error);
      alert('Error managing break');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-center text-gray-500">Loading break info...</p>
      </Card>
    );
  }

  const onBreak = breakStatus?.on_break;
  const activeBreak = breakStatus?.active_break;

  return (
    <div className="space-y-4">
      {/* Active Break */}
      {onBreak && activeBreak && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Coffee className="w-6 h-6 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">On Break</h3>
                <p className="text-sm text-amber-700 capitalize">
                  {activeBreak.break_type} break
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-amber-700">Started</p>
              <p className="font-medium text-amber-900">
                {new Date(activeBreak.break_start).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <Button
            onClick={() => handleBreakAction(activeBreak.break_type, 'end')}
            disabled={actionLoading}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            <StopCircle className="w-5 h-5 mr-2" />
            End Break
          </Button>
        </Card>
      )}

      {/* Break Actions */}
      {!onBreak && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Coffee className="w-5 h-5 text-opsos-sage-600" />
            Start a Break
          </h3>

          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => handleBreakAction('meal', 'start')}
              disabled={actionLoading}
              variant="outline"
              className="flex-col h-auto py-3"
            >
              <Coffee className="w-6 h-6 mb-1" />
              <span className="text-xs">Meal</span>
              <span className="text-xs text-gray-500">(30 min)</span>
            </Button>

            <Button
              onClick={() => handleBreakAction('rest', 'start')}
              disabled={actionLoading}
              variant="outline"
              className="flex-col h-auto py-3"
            >
              <Clock className="w-6 h-6 mb-1" />
              <span className="text-xs">Rest</span>
              <span className="text-xs text-gray-500">(10 min)</span>
            </Button>

            <Button
              onClick={() => handleBreakAction('unpaid', 'start')}
              disabled={actionLoading}
              variant="outline"
              className="flex-col h-auto py-3"
            >
              <PlayCircle className="w-6 h-6 mb-1" />
              <span className="text-xs">Unpaid</span>
              <span className="text-xs text-gray-500">(Personal)</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Today's Breaks */}
      {breakStatus?.today_breaks && breakStatus.today_breaks.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Today's Breaks</h3>
          <div className="space-y-2">
            {breakStatus.today_breaks.map((brk: Break) => (
              <div
                key={brk.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded"
              >
                <div className="flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-gray-500" />
                  <span className="text-sm capitalize">{brk.break_type}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600">
                    {new Date(brk.break_start).toLocaleTimeString()} -{' '}
                    {brk.break_end
                      ? new Date(brk.break_end).toLocaleTimeString()
                      : 'Active'}
                  </p>
                  {brk.break_duration_minutes && (
                    <Badge variant="outline" className="text-xs">
                      {Math.round(brk.break_duration_minutes)} min
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
