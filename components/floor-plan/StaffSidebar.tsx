'use client';

import { Input } from '@/components/ui/input';
import { StaffCard } from './StaffCard';
import { SectionDropZone } from './SectionDropZone';
import type { VenueSection } from '@/lib/database/floor-plan';

interface StaffMember {
  employee_id: string;
  employee_name: string;
  position_name: string;
}

interface Assignment {
  id: string;
  section_id: string;
  employee_id: string;
  employee_name: string;
  position_name: string;
}

const SHIFT_OPTIONS = [
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'late_night', label: 'Late Night' },
  { value: 'breakfast', label: 'Breakfast' },
];

interface StaffSidebarProps {
  sections: VenueSection[];
  assignments: Assignment[];
  unassigned: StaffMember[];
  onRemoveAssignment: (employeeId: string) => void;
  date: string;
  onDateChange: (date: string) => void;
  shiftType: string;
  onShiftTypeChange: (shift: string) => void;
  loading: boolean;
}

export function StaffSidebar({
  sections,
  assignments,
  unassigned,
  onRemoveAssignment,
  date,
  onDateChange,
  shiftType,
  onShiftTypeChange,
  loading,
}: StaffSidebarProps) {
  // Group assignments by section
  const bySectionId = new Map<string, StaffMember[]>();
  for (const a of assignments) {
    const list = bySectionId.get(a.section_id) || [];
    list.push({
      employee_id: a.employee_id,
      employee_name: a.employee_name,
      position_name: a.position_name,
    });
    bySectionId.set(a.section_id, list);
  }

  // Find section name for an assigned employee
  const assignmentSectionName = (employeeId: string): string | undefined => {
    const a = assignments.find((x) => x.employee_id === employeeId);
    if (!a) return undefined;
    return sections.find((s) => s.id === a.section_id)?.name;
  };

  return (
    <div className="w-72 border-l bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-gray-800">Staff Assignments</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Drag staff to sections below
        </p>
      </div>

      {/* Date + shift picker — staff assignments vary by shift */}
      <div className="px-3 py-2 border-b flex gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="flex-1 text-xs h-8"
        />
        <select
          value={shiftType}
          onChange={(e) => onShiftTypeChange(e.target.value)}
          className="px-2 py-1 border rounded-md text-xs"
        >
          {SHIFT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading schedule...</p>
        ) : (
          <>
            {/* Unassigned staff */}
            {unassigned.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Unassigned ({unassigned.length})
                </h4>
                <div className="space-y-1.5">
                  {unassigned.map((s) => (
                    <StaffCard
                      key={s.employee_id}
                      employeeId={s.employee_id}
                      name={s.employee_name}
                      position={s.position_name}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Section drop zones */}
            {sections.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Sections
                </h4>
                <div className="space-y-2">
                  {sections.map((section) => (
                    <SectionDropZone
                      key={section.id}
                      section={section}
                      assignedStaff={bySectionId.get(section.id) || []}
                      onRemoveStaff={onRemoveAssignment}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Assigned staff (if they need to be re-dragged) */}
            {assignments.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Assigned ({assignments.length})
                </h4>
                <div className="space-y-1.5">
                  {assignments.map((a) => (
                    <StaffCard
                      key={a.employee_id}
                      employeeId={a.employee_id}
                      name={a.employee_name}
                      position={a.position_name}
                      assignedSection={assignmentSectionName(a.employee_id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {unassigned.length === 0 && assignments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No scheduled FOH staff for this shift
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
