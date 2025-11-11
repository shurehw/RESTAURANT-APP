'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Repeat, Calendar, Clock, Users, CheckCircle, XCircle } from 'lucide-react';

interface ShiftSwap {
  id: string;
  original_shift_date: string;
  original_shift_start: string;
  original_shift_end: string;
  original_employee_name: string;
  swap_employee_name?: string;
  position_name: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  is_requesting: boolean; // true if current employee is requesting swap
}

interface AvailableShift {
  id: string;
  employee_name: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  position_name: string;
}

export function ShiftSwapList({ employee }: { employee: any }) {
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [availableShifts, setAvailableShifts] = useState<AvailableShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);

  useEffect(() => {
    if (employee) {
      loadSwaps();
      loadAvailableShifts();
    }
  }, [employee]);

  const loadSwaps = async () => {
    if (!employee) return;

    try {
      const response = await fetch(
        `/api/employee/shift-swaps?employee_id=${employee.id}`
      );
      const data = await response.json();
      setSwaps(data.swaps || []);
    } catch (error) {
      console.error('Error loading swaps:', error);
    }
  };

  const loadAvailableShifts = async () => {
    if (!employee) return;

    try {
      const response = await fetch(
        `/api/employee/shift-swaps/available?employee_id=${employee.id}`
      );
      const data = await response.json();
      setAvailableShifts(data.shifts || []);
    } catch (error) {
      console.error('Error loading available shifts:', error);
    }
  };

  const handleRequestSwap = async (shiftId: string) => {
    if (!employee) return;

    setLoading(true);

    try {
      const response = await fetch('/api/employee/shift-swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.id,
          original_shift_id: shiftId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Swap request submitted for manager approval');
        setShowAvailable(false);
        loadSwaps();
        loadAvailableShifts();
      } else {
        alert(result.error || 'Failed to request swap');
      }
    } catch (error) {
      console.error('Error requesting swap:', error);
      alert('Error requesting swap');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptSwap = async (swapId: string) => {
    if (!employee) return;

    setLoading(true);

    try {
      const response = await fetch('/api/employee/shift-swaps/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swap_id: swapId,
          employee_id: employee.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Swap accepted - pending manager approval');
        loadSwaps();
      } else {
        alert(result.error || 'Failed to accept swap');
      }
    } catch (error) {
      console.error('Error accepting swap:', error);
      alert('Error accepting swap');
    } finally {
      setLoading(false);
    }
  };

  if (showAvailable) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Available Shifts</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAvailable(false)}>
            Back
          </Button>
        </div>

        {availableShifts.length === 0 ? (
          <Card className="p-6 text-center">
            <Repeat className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Shifts Available</h3>
            <p className="text-gray-600 text-sm">
              No other employees are looking to swap shifts right now
            </p>
          </Card>
        ) : (
          availableShifts.map((shift) => (
            <Card key={shift.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold">{shift.employee_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    {new Date(shift.shift_date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <Clock className="w-4 h-4" />
                    {new Date(shift.shift_start).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    -{' '}
                    {new Date(shift.shift_end).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <Badge variant="outline" className="mt-2">
                    {shift.position_name}
                  </Badge>
                </div>
              </div>

              <Button
                onClick={() => handleRequestSwap(shift.id)}
                disabled={loading}
                className="w-full bg-opsos-sage-600 hover:bg-opsos-sage-700"
              >
                <Repeat className="w-4 h-4 mr-2" />
                Request to Take This Shift
              </Button>
            </Card>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={() => setShowAvailable(true)}
        className="w-full bg-opsos-sage-600 hover:bg-opsos-sage-700"
      >
        <Repeat className="w-5 h-5 mr-2" />
        Browse Available Swaps
      </Button>

      {/* My Swap Requests */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">My Requests</h3>
        {swaps.filter((s) => s.is_requesting).length === 0 ? (
          <Card className="p-4 text-center text-sm text-gray-600">
            No swap requests yet
          </Card>
        ) : (
          <div className="space-y-3">
            {swaps
              .filter((s) => s.is_requesting)
              .map((swap) => (
                <Card key={swap.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">
                          {new Date(swap.original_shift_date).toLocaleDateString(
                            'en-US',
                            {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </h4>
                        <StatusBadge status={swap.status} />
                      </div>
                      <p className="text-sm text-gray-600">
                        {new Date(swap.original_shift_start).toLocaleTimeString(
                          'en-US',
                          { hour: 'numeric', minute: '2-digit' }
                        )}{' '}
                        -{' '}
                        {new Date(swap.original_shift_end).toLocaleTimeString(
                          'en-US',
                          { hour: 'numeric', minute: '2-digit' }
                        )}
                      </p>
                      <Badge variant="outline" className="mt-1">
                        {swap.position_name}
                      </Badge>
                      {swap.swap_employee_name && (
                        <p className="text-xs text-gray-500 mt-2">
                          Swapping with {swap.swap_employee_name}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Incoming Swap Requests */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Requests for My Shifts
        </h3>
        {swaps.filter((s) => !s.is_requesting && s.status === 'pending').length ===
        0 ? (
          <Card className="p-4 text-center text-sm text-gray-600">
            No incoming requests
          </Card>
        ) : (
          <div className="space-y-3">
            {swaps
              .filter((s) => !s.is_requesting && s.status === 'pending')
              .map((swap) => (
                <Card key={swap.id} className="p-4">
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="font-semibold">
                        {swap.swap_employee_name}
                      </span>
                      <span className="text-sm text-gray-600">wants your shift</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {new Date(swap.original_shift_date).toLocaleDateString(
                        'en-US',
                        { weekday: 'short', month: 'short', day: 'numeric' }
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {new Date(swap.original_shift_start).toLocaleTimeString(
                        'en-US',
                        { hour: 'numeric', minute: '2-digit' }
                      )}{' '}
                      -{' '}
                      {new Date(swap.original_shift_end).toLocaleTimeString(
                        'en-US',
                        { hour: 'numeric', minute: '2-digit' }
                      )}
                    </p>
                  </div>

                  <Button
                    onClick={() => handleAcceptSwap(swap.id)}
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Accept Swap
                  </Button>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: {
      color: 'bg-amber-100 text-amber-800',
      icon: <Clock className="w-3 h-3" />,
    },
    approved: {
      color: 'bg-green-100 text-green-800',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    denied: {
      color: 'bg-red-100 text-red-800',
      icon: <XCircle className="w-3 h-3" />,
    },
  };

  const { color, icon } = config[status as keyof typeof config];

  return (
    <Badge className={`${color} flex items-center gap-1`}>
      {icon}
      <span className="capitalize">{status}</span>
    </Badge>
  );
}
