'use client';

import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  primary_position_id: string;
}

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

interface Props {
  shift: Shift | null;
  employees: Employee[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const REASON_CATEGORIES = [
  'Employee request',
  'Understaffed',
  'Overstaffed',
  'Skill mismatch',
  'Availability change',
  'Schedule conflict',
  'Other',
];

function extractUTCTime(isoStr: string): string {
  if (!isoStr) return '';
  if (isoStr.includes('T')) {
    const d = new Date(isoStr);
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
  }
  return isoStr.slice(0, 5);
}

export function ShiftEditDialog({ shift, employees, open, onOpenChange, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [reasonCategory, setReasonCategory] = useState('Other');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize form when dialog opens or shift changes
  useEffect(() => {
    if (open && shift) {
      setEmployeeId(shift.employee_id || '');
      setStartTime(extractUTCTime(shift.scheduled_start));
      setEndTime(extractUTCTime(shift.scheduled_end));
      setReason('');
      setReasonCategory('Other');
      setShowDeleteConfirm(false);
    }
  }, [open, shift]);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const calculateHours = (): number => {
    if (!startTime || !endTime) return shift?.scheduled_hours || 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // Overnight shift
    return Math.round((diff / 60) * 100) / 100;
  };

  const hasChanges = (): boolean => {
    if (!shift) return false;
    return (
      employeeId !== shift.employee_id ||
      startTime !== extractUTCTime(shift.scheduled_start) ||
      endTime !== extractUTCTime(shift.scheduled_end)
    );
  };

  const handleSave = async () => {
    if (!shift) return;
    if (!employeeId) {
      toast.error('Please select an employee');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason for this change');
      return;
    }
    if (!hasChanges()) {
      toast.error('No changes detected');
      return;
    }

    setSaving(true);
    try {
      const updates: Record<string, any> = {
        shift_id: shift.id,
        reason: reason.trim(),
        reason_category: reasonCategory,
      };

      if (employeeId !== shift.employee_id) {
        updates.employee_id = employeeId;
      }
      if (startTime !== extractUTCTime(shift.scheduled_start)) {
        updates.scheduled_start = `${shift.business_date}T${startTime}:00`;
      }
      if (endTime !== extractUTCTime(shift.scheduled_end)) {
        updates.scheduled_end = `${shift.business_date}T${endTime}:00`;
      }

      const hours = calculateHours();
      if (hours !== shift.scheduled_hours) {
        updates.scheduled_hours = hours;
      }

      const res = await fetch('/api/labor/schedule/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Shift updated successfully');
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(data.message || 'Failed to update shift');
      }
    } catch (err) {
      console.error('Edit shift error:', err);
      toast.error('Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!shift) return;
    if (!reason.trim()) {
      toast.error('Please provide a reason for removing this shift');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/labor/schedule/shifts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_id: shift.id,
          reason: reason.trim(),
          reason_category: reasonCategory,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Shift removed');
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(data.message || 'Failed to remove shift');
      }
    } catch (err) {
      console.error('Delete shift error:', err);
      toast.error('Failed to remove shift');
    } finally {
      setDeleting(false);
    }
  };

  // Filter employees to same position, always include currently assigned employee
  const eligibleEmployees = employees.filter(
    e => e.primary_position_id === shift?.position_id || e.id === shift?.employee_id
  );

  if (!shift) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Shift</DialogTitle>
          <DialogDescription>
            {shift.position?.name} - {shift.business_date}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current assignment info */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Currently:</span>
            <Badge variant="outline">
              {shift.employee ? `${shift.employee.first_name} ${shift.employee.last_name}` : 'Unassigned'}
            </Badge>
            {shift.is_modified && <Badge variant="brass" className="text-xs">Modified</Badge>}
          </div>

          {/* Employee selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Employee</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {!employeeId && (
                <option value="">Select an employee...</option>
              )}
              {eligibleEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
              {eligibleEmployees.length === 0 && (
                <option value="">No eligible employees</option>
              )}
            </select>
          </div>

          {/* Time pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Start Time</label>
              <input
                type="time"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">End Time</label>
              <input
                type="time"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Hours display */}
          <div className="text-sm text-gray-600">
            Hours: <span className="font-medium">{calculateHours()}</span>h
            {shift.position && (
              <span className="ml-3">
                Cost: <span className="font-medium">${(calculateHours() * shift.position.base_hourly_rate).toFixed(2)}</span>
              </span>
            )}
          </div>

          {/* Reason category */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Reason Category</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
            >
              {REASON_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Reason text */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Reason for Change <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[60px]"
              placeholder="Why are you making this change? (helps the AI learn)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {/* Delete shift */}
          {!showDeleteConfirm ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Remove
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting || !reason.trim()}
            >
              {deleting ? 'Removing...' : 'Confirm Remove'}
            </Button>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges() || !reason.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
