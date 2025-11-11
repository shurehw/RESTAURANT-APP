'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Save } from 'lucide-react';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const SHIFT_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
];

interface Availability {
  day_of_week: number;
  shift_type: string;
  is_available: boolean;
}

export function AvailabilityManager({ employee }: { employee: any }) {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (employee) {
      loadAvailability();
    }
  }, [employee]);

  const loadAvailability = async () => {
    if (!employee) return;

    try {
      const response = await fetch(
        `/api/employee/availability?employee_id=${employee.id}`
      );
      const data = await response.json();

      // Initialize all combinations with existing data
      const availMap = new Map(
        data.availability?.map((a: Availability) => [
          `${a.day_of_week}-${a.shift_type}`,
          a.is_available,
        ]) || []
      );

      const fullAvailability: Availability[] = [];
      for (const day of DAYS) {
        for (const shift of SHIFT_TYPES) {
          const key = `${day.value}-${shift.value}`;
          fullAvailability.push({
            day_of_week: day.value,
            shift_type: shift.value,
            is_available: availMap.get(key) ?? true, // Default to available
          });
        }
      }

      setAvailability(fullAvailability);
    } catch (error) {
      console.error('Error loading availability:', error);
    }
  };

  const toggleAvailability = (dayOfWeek: number, shiftType: string) => {
    setAvailability((prev) =>
      prev.map((a) =>
        a.day_of_week === dayOfWeek && a.shift_type === shiftType
          ? { ...a, is_available: !a.is_available }
          : a
      )
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!employee) return;

    setLoading(true);

    try {
      const response = await fetch('/api/employee/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.id,
          venue_id: employee.venue_id,
          availability: availability,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Availability saved successfully');
        setHasChanges(false);
      } else {
        alert(result.error || 'Failed to save availability');
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      alert('Error saving availability');
    } finally {
      setLoading(false);
    }
  };

  const isAvailable = (dayOfWeek: number, shiftType: string) => {
    return availability.find(
      (a) => a.day_of_week === dayOfWeek && a.shift_type === shiftType
    )?.is_available;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">My Availability</h2>
          {hasChanges && (
            <Button
              onClick={handleSave}
              disabled={loading}
              size="sm"
              className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Tap to toggle your availability for each shift. Green = Available, Gray
          = Not Available
        </p>

        {/* Availability Grid */}
        <div className="space-y-4">
          {DAYS.map((day) => (
            <div key={day.value}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {day.label}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {SHIFT_TYPES.map((shift) => {
                  const available = isAvailable(day.value, shift.value);
                  return (
                    <button
                      key={shift.value}
                      onClick={() => toggleAvailability(day.value, shift.value)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        available
                          ? 'bg-green-100 border-green-500 text-green-800'
                          : 'bg-gray-100 border-gray-300 text-gray-500'
                      }`}
                    >
                      <Clock className="w-4 h-4 mx-auto mb-1" />
                      <span className="text-xs font-medium capitalize">
                        {shift.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Actions */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailability((prev) =>
                prev.map((a) => ({ ...a, is_available: true }))
              );
              setHasChanges(true);
            }}
          >
            Mark All Available
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailability((prev) =>
                prev.map((a) => ({ ...a, is_available: false }))
              );
              setHasChanges(true);
            }}
          >
            Mark All Unavailable
          </Button>
        </div>
      </Card>

      {/* Info */}
      <div className="text-xs text-gray-500 text-center">
        Changes will be reviewed by your manager and may affect future schedules
      </div>
    </div>
  );
}
