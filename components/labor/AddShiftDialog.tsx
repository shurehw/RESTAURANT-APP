'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  primary_position_id: string;
}

interface Position {
  id: string;
  name: string;
  category?: string;
  base_hourly_rate: number;
}

interface Props {
  scheduleId: string;
  date: string;
  positions: Position[];
  employees: Employee[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initialPositionName?: string;
}

const SHIFT_TYPES: Record<string, { label: string; start: string; end: string; hours: number }> = {
  breakfast: { label: 'Breakfast', start: '07:00', end: '14:00', hours: 7 },
  lunch: { label: 'Lunch', start: '11:00', end: '16:00', hours: 5 },
  dinner: { label: 'Dinner', start: '17:00', end: '23:00', hours: 6 },
  late_night: { label: 'Late Night', start: '22:00', end: '02:00', hours: 4 },
};

const REASON_CATEGORIES = [
  'Understaffed',
  'Special event',
  'Employee request',
  'Coverage needed',
  'Other',
];

export function AddShiftDialog({ scheduleId, date, positions, employees, open, onOpenChange, onSaved, initialPositionName }: Props) {
  const [positionId, setPositionId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [shiftType, setShiftType] = useState('dinner');
  const [startTime, setStartTime] = useState(SHIFT_TYPES.dinner.start);
  const [endTime, setEndTime] = useState(SHIFT_TYPES.dinner.end);
  const [reason, setReason] = useState('');
  const [reasonCategory, setReasonCategory] = useState('Understaffed');
  const [saving, setSaving] = useState(false);

  const handleShiftTypeChange = (type: string) => {
    setShiftType(type);
    const config = SHIFT_TYPES[type];
    if (config) {
      setStartTime(config.start);
      setEndTime(config.end);
    }
  };

  const filteredEmployees = positionId
    ? employees.filter(e => e.primary_position_id === positionId)
    : employees;

  const calculateHours = (): number => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    return Math.round((diff / 60) * 100) / 100;
  };

  const selectedPosition = positions.find(p => p.id === positionId);
  const hours = calculateHours();
  const cost = selectedPosition ? hours * selectedPosition.base_hourly_rate : 0;

  const handleSave = async () => {
    if (!positionId || !employeeId || !reason.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/labor/schedule/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: scheduleId,
          employee_id: employeeId,
          position_id: positionId,
          business_date: date,
          shift_type: shiftType,
          scheduled_start: `${date}T${startTime}:00`,
          scheduled_end: `${date}T${endTime}:00`,
          scheduled_hours: hours,
          reason: reason.trim(),
          reason_category: reasonCategory,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Shift added successfully');
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(data.message || 'Failed to add shift');
      }
    } catch (err) {
      console.error('Add shift error:', err);
      toast.error('Failed to add shift');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Reset form — pre-select position if initialPositionName provided
      const matchedPos = initialPositionName
        ? positions.find(p => p.name === initialPositionName)
        : null;
      setPositionId(matchedPos?.id || positions[0]?.id || '');
      setEmployeeId('');
      setShiftType('dinner');
      setStartTime(SHIFT_TYPES.dinner.start);
      setEndTime(SHIFT_TYPES.dinner.end);
      setReason('');
      setReasonCategory('Understaffed');
    }
    onOpenChange(isOpen);
  };

  const dateObj = new Date(date + 'T00:00:00');
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Shift</DialogTitle>
          <DialogDescription>{dayName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Position selector */}
          <div>
            <label htmlFor="shift-position" className="text-sm font-medium text-gray-700 block mb-1">
              Position <span className="text-red-500">*</span>
            </label>
            <select
              id="shift-position"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={positionId}
              onChange={(e) => { setPositionId(e.target.value); setEmployeeId(''); }}
            >
              <option value="">Select position...</option>
              {positions.map(pos => (
                <option key={pos.id} value={pos.id}>
                  {pos.name} (${pos.base_hourly_rate}/hr)
                </option>
              ))}
            </select>
          </div>

          {/* Employee selector */}
          <div>
            <label htmlFor="shift-employee-add" className="text-sm font-medium text-gray-700 block mb-1">
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              id="shift-employee-add"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!positionId}
            >
              <option value="">Select employee...</option>
              {filteredEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
            {positionId && filteredEmployees.length === 0 && (
              <p className="text-xs text-red-500 mt-1">No employees assigned to this position</p>
            )}
          </div>

          {/* Shift type */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Shift Type</label>
            <div className="grid grid-cols-4 gap-1">
              {Object.entries(SHIFT_TYPES).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                    shiftType === key
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleShiftTypeChange(key)}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="shift-start-time" className="text-sm font-medium text-gray-700 block mb-1">Start Time</label>
              <input
                id="shift-start-time"
                type="time"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="shift-end-time" className="text-sm font-medium text-gray-700 block mb-1">End Time</label>
              <input
                id="shift-end-time"
                type="time"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Hours & cost */}
          <div className="text-sm text-gray-600">
            Hours: <span className="font-medium">{hours}</span>h
            {selectedPosition && (
              <span className="ml-3">
                Est. Cost: <span className="font-medium">${cost.toFixed(2)}</span>
              </span>
            )}
          </div>

          {/* Reason category */}
          <div>
            <label htmlFor="shift-reason-category" className="text-sm font-medium text-gray-700 block mb-1">Reason Category</label>
            <select
              id="shift-reason-category"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
            >
              {REASON_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label htmlFor="shift-reason" className="text-sm font-medium text-gray-700 block mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="shift-reason"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[60px]"
              placeholder="Why are you adding this shift? (helps the AI learn)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !positionId || !employeeId || !reason.trim()}
          >
            {saving ? 'Adding...' : 'Add Shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
