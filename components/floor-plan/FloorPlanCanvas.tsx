'use client';

import { useRef, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { DraggableTable } from './DraggableTable';
import { SectionOverlay } from './SectionOverlay';
import type { VenueTable, VenueSection, VenueLabel } from '@/lib/database/floor-plan';

export interface TableVisualMeta {
  status: string;
  seatedAt: string | null;
  currentSpend: number;
  turnNumber: number;
  isVip: boolean;
  isArrived: boolean;
  spendIntensity: number; // 0-1
}

interface FloorPlanCanvasProps {
  tables: VenueTable[];
  sections: VenueSection[];
  labels: VenueLabel[];
  selectedTableIds: Set<string>;
  highlightedTableIds?: Set<string>;
  tableColorMap?: Map<string, string>;
  tableLabelMap?: Map<string, string>;
  tableMetaMap?: Map<string, TableVisualMeta>;
  transitioningTableIds?: Set<string>;
  sectionServerMap?: Map<string, string>;
  sectionCoverMap?: Map<string, number>;
  onSelectTable: (id: string, additive: boolean) => void;
  onDeselectAll: () => void;
  onDoubleClickTable: (table: VenueTable) => void;
  onResize?: (tableId: string, dw: number, dh: number, dx: number, dy: number) => void;
  onDoubleClickLabel?: (label: VenueLabel) => void;
  readOnly?: boolean;
}

export function FloorPlanCanvas({
  tables,
  sections,
  labels,
  selectedTableIds,
  highlightedTableIds,
  tableColorMap,
  tableLabelMap,
  tableMetaMap,
  transitioningTableIds,
  onSelectTable,
  onDeselectAll,
  onDoubleClickTable,
  onResize,
  onDoubleClickLabel,
  readOnly,
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { setNodeRef } = useDroppable({
    id: 'canvas',
    data: { type: 'canvas' },
  });

  const handleCanvasClick = useCallback(() => {
    onDeselectAll();
  }, [onDeselectAll]);

  // Map section_id → section for quick lookup
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as any).current = node;
      }}
      className="relative w-full border border-white/[0.04] rounded-xl overflow-hidden"
      style={{
        aspectRatio: '16 / 10',
        background: readOnly
          ? 'radial-gradient(ellipse at 50% 40%, #1c1c30 0%, #111120 50%, #0a0a16 100%)'
          : '#1a1a2e',
      }}
      onClick={handleCanvasClick}
    >
      {/* Subtle grid — editor only */}
      {!readOnly && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, #2a2a4e 0.5px, transparent 0.5px)',
            backgroundSize: '2.5% 4%',
            opacity: 0.5,
          }}
        />
      )}

      {/* Section overlays (behind tables) — editor only */}
      {!readOnly && sections.map((section) => (
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
          className={`absolute font-bold uppercase tracking-widest select-none pointer-events-auto ${readOnly ? 'cursor-default' : 'cursor-grab'}`}
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
            if (!readOnly) onDoubleClickLabel?.(label);
          }}
        >
          {label.text}
        </span>
      ))}

      {/* Tables */}
      {tables.map((table) => {
        const overrideColor = tableColorMap?.get(table.id);
        const isHighlighted = highlightedTableIds?.has(table.id) ?? false;
        const label = tableLabelMap?.get(table.id);
        const meta = tableMetaMap?.get(table.id);
        const isTransitioning = transitioningTableIds?.has(table.id) ?? false;
        return (
          <div key={table.id}>
            <DraggableTable
              table={table}
              section={table.section_id ? sectionMap.get(table.section_id) : undefined}
              isSelected={selectedTableIds.has(table.id)}
              isHighlighted={isHighlighted}
              overrideColor={overrideColor}
              meta={meta}
              isTransitioning={isTransitioning}
              onSelect={onSelectTable}
              onDoubleClick={onDoubleClickTable}
              onResize={onResize}
              readOnly={readOnly}
            />
            {label && (
              <div
                className="absolute pointer-events-none text-center"
                style={{
                  left: `${table.pos_x}%`,
                  top: `${table.pos_y + table.height + 0.3}%`,
                  width: `${table.width}%`,
                  zIndex: 15,
                }}
              >
                <span
                  className="text-[8px] font-medium px-1.5 py-0.5 rounded-sm truncate max-w-full inline-block"
                  style={{
                    color: 'rgba(255,255,255,0.85)',
                    background: 'rgba(0,0,0,0.45)',
                    backdropFilter: 'blur(4px)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {label}
                </span>
              </div>
            )}
          </div>
        );
      })}

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
