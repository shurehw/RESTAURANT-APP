'use client';

import { useRef, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { DraggableTable } from './DraggableTable';
import { SectionOverlay } from './SectionOverlay';
import type { VenueTable, VenueSection, VenueLabel } from '@/lib/database/floor-plan';

interface FloorPlanCanvasProps {
  tables: VenueTable[];
  sections: VenueSection[];
  labels: VenueLabel[];
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  onDoubleClickTable: (table: VenueTable) => void;
  onResize?: (tableId: string, dw: number, dh: number, dx: number, dy: number) => void;
  onDoubleClickLabel?: (label: VenueLabel) => void;
}

export function FloorPlanCanvas({
  tables,
  sections,
  labels,
  selectedTableId,
  onSelectTable,
  onDoubleClickTable,
  onResize,
  onDoubleClickLabel,
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { setNodeRef } = useDroppable({
    id: 'canvas',
    data: { type: 'canvas' },
  });

  const handleCanvasClick = useCallback(() => {
    onSelectTable(null);
  }, [onSelectTable]);

  // Map section_id → section for quick lookup
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as any).current = node;
      }}
      className="relative w-full bg-[#1a1a2e] border border-gray-800 rounded-lg overflow-hidden"
      style={{ aspectRatio: '16 / 10' }}
      onClick={handleCanvasClick}
    >
      {/* Grid dots background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, #2a2a4e 1px, transparent 1px)',
          backgroundSize: '2.5% 4%',
        }}
      />

      {/* Section overlays (behind tables) */}
      {sections.map((section) => (
        <SectionOverlay
          key={section.id}
          section={section}
          tables={tables}
        />
      ))}

      {/* Canvas labels */}
      {labels.map((label) => (
        <span
          key={label.id}
          className="absolute font-bold uppercase tracking-widest select-none pointer-events-auto cursor-grab"
          style={{
            left: `${label.pos_x}%`,
            top: `${label.pos_y}%`,
            fontSize: `${label.font_size}px`,
            color: label.color,
            transform: `rotate(${label.rotation}deg)`,
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
            zIndex: 5,
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClickLabel?.(label);
          }}
        >
          {label.text}
        </span>
      ))}

      {/* Tables */}
      {tables.map((table) => (
        <DraggableTable
          key={table.id}
          table={table}
          section={table.section_id ? sectionMap.get(table.section_id) : undefined}
          isSelected={selectedTableId === table.id}
          onSelect={onSelectTable}
          onDoubleClick={onDoubleClickTable}
          onResize={onResize}
        />
      ))}

      {/* Empty state */}
      {tables.length === 0 && labels.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-lg font-medium">No tables yet</p>
            <p className="text-sm mt-1">Click &quot;Add Table&quot; to start building your floor plan</p>
          </div>
        </div>
      )}
    </div>
  );
}
