'use client';

import { useDraggable } from '@dnd-kit/core';
import { TableShape } from './TableShape';
import type { VenueTable, VenueSection } from '@/lib/database/floor-plan';

interface DraggableTableProps {
  table: VenueTable;
  section?: VenueSection;
  isSelected: boolean;
  isHighlighted?: boolean;
  overrideColor?: string;
  onSelect: (id: string, additive: boolean) => void;
  onDoubleClick: (table: VenueTable) => void;
  onResize?: (tableId: string, dw: number, dh: number, dx: number, dy: number) => void;
  readOnly?: boolean;
}

export function DraggableTable({
  table,
  section,
  isSelected,
  isHighlighted,
  overrideColor,
  onSelect,
  onDoubleClick,
  onResize,
  readOnly,
}: DraggableTableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `table-${table.id}`,
    data: { type: 'table', table },
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${table.pos_x}%`,
    top: `${table.pos_y}%`,
    width: `${table.width}%`,
    height: `${table.height}%`,
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px) rotate(${table.rotation}deg)`
      : `rotate(${table.rotation}deg)`,
    zIndex: isDragging ? 50 : isSelected ? 20 : 10,
    cursor: readOnly || table.table_number.startsWith('BAR-CTR') ? 'default' : 'grab',
    transition: isDragging ? undefined : 'box-shadow 150ms ease',
  };

  // In staff mode, use the split's color; otherwise use section color
  const sectionColor = overrideColor || section?.color || '#6B7280';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="select-none"
    >
      {/* Drag surface */}
      <div
        className={`
          w-full h-full
          ${isDragging ? 'opacity-80 scale-105' : ''}
          ${isSelected ? 'ring-[1.5px] ring-white/60 ring-offset-1 ring-offset-transparent rounded-full' : ''}
          ${isHighlighted ? 'ring-[1.5px] ring-white/40 ring-offset-1 ring-offset-transparent rounded-full' : ''}
        `}
        {...(readOnly ? {} : listeners)}
        {...(readOnly ? {} : attributes)}
        onClick={(e) => {
          e.stopPropagation();
          if (table.table_number.startsWith('BAR-CTR')) return;
          onSelect(table.id, e.shiftKey || e.metaKey || e.ctrlKey);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!readOnly) onDoubleClick(table);
        }}
        title={`Table ${table.table_number} | ${table.min_capacity || 1}-${table.max_capacity} guests`}
      >
        <TableShape
          shape={table.shape}
          capacity={table.max_capacity}
          minCapacity={table.min_capacity}
          sectionColor={sectionColor}
          tableNumber={table.table_number}
          isSelected={isSelected}
        />
      </div>

      {/* Resize handles — only when selected in edit mode */}
      {isSelected && onResize && !readOnly && (
        <>
          <ResizeCorner position="se" tableId={table.id} onResize={onResize} />
          <ResizeCorner position="sw" tableId={table.id} onResize={onResize} />
          <ResizeCorner position="ne" tableId={table.id} onResize={onResize} />
          <ResizeCorner position="nw" tableId={table.id} onResize={onResize} />
        </>
      )}
    </div>
  );
}

// ── Inline Resize Handle ────────────────────────────────────────

function ResizeCorner({
  position,
  tableId,
  onResize,
}: {
  position: 'nw' | 'ne' | 'sw' | 'se';
  tableId: string;
  onResize: (tableId: string, dw: number, dh: number, dx: number, dy: number) => void;
}) {
  const positionStyles: React.CSSProperties = {
    nw: { top: -4, left: -4, cursor: 'nw-resize' },
    ne: { top: -4, right: -4, cursor: 'ne-resize' },
    sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
    se: { bottom: -4, right: -4, cursor: 'se-resize' },
  }[position];

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;

    // Get canvas container for percentage conversion
    const canvas = document.querySelector('[style*="aspect-ratio"]');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dxPx = ev.clientX - startX;
      const dyPx = ev.clientY - startY;
      const dxPct = (dxPx / rect.width) * 100;
      const dyPct = (dyPx / rect.height) * 100;

      // Compute size and position deltas based on corner
      let dw = 0, dh = 0, dx = 0, dy = 0;
      if (position === 'se') { dw = dxPct; dh = dyPct; }
      else if (position === 'sw') { dw = -dxPct; dh = dyPct; dx = dxPct; }
      else if (position === 'ne') { dw = dxPct; dh = -dyPct; dy = dyPct; }
      else if (position === 'nw') { dw = -dxPct; dh = -dyPct; dx = dxPct; dy = dyPct; }

      onResize(tableId, dw, dh, dx, dy);
    };

    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="absolute w-2.5 h-2.5 bg-opsos-brass-400 border border-opsos-brass-600 rounded-sm z-50 hover:bg-opsos-brass-300"
      style={positionStyles}
      onPointerDown={handlePointerDown}
    />
  );
}
