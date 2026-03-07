'use client';

import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';

interface StaffCardProps {
  employeeId: string;
  name: string;
  position: string;
  assignedSection?: string;
}

export function StaffCard({ employeeId, name, position, assignedSection }: StaffCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${employeeId}`,
    data: { type: 'staff', employeeId, name, position },
  });

  const style: React.CSSProperties = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 100,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center justify-between gap-2 px-3 py-2 rounded-md border cursor-grab
        ${isDragging ? 'opacity-70 shadow-md bg-white' : 'bg-white hover:bg-gray-50'}
        ${assignedSection ? 'border-opsos-sage-300' : 'border-gray-200'}
      `}
      {...listeners}
      {...attributes}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
        <span className="text-xs text-gray-500">{position}</span>
      </div>
      {assignedSection && (
        <Badge variant="sage" className="text-[10px] shrink-0">
          {assignedSection}
        </Badge>
      )}
    </div>
  );
}
