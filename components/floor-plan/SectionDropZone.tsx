'use client';

import { useDroppable } from '@dnd-kit/core';
import type { VenueSection } from '@/lib/database/floor-plan';

interface SectionDropZoneProps {
  section: VenueSection;
  assignedStaff: { employee_id: string; employee_name: string; position_name: string }[];
  onRemoveStaff: (employeeId: string) => void;
}

export function SectionDropZone({ section, assignedStaff, onRemoveStaff }: SectionDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `section-drop-${section.id}`,
    data: { type: 'section', sectionId: section.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-lg border-2 border-dashed p-3 transition-colors
        ${isOver ? 'border-opsos-brass-400 bg-opsos-brass-50' : 'border-gray-200 bg-gray-50'}
      `}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: section.color }}
        />
        <span className="text-sm font-semibold text-gray-800">{section.name}</span>
        <span className="text-xs text-gray-400 ml-auto">
          {assignedStaff.length} staff
        </span>
      </div>

      {assignedStaff.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Drop staff here</p>
      ) : (
        <div className="space-y-1">
          {assignedStaff.map((s) => (
            <div
              key={s.employee_id}
              className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border"
            >
              <span className="text-gray-700">{s.employee_name}</span>
              <button
                onClick={() => onRemoveStaff(s.employee_id)}
                className="text-gray-400 hover:text-red-500 text-[10px] ml-2"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
