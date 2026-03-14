'use client';

import { useDraggable } from '@dnd-kit/core';
import { TableShape } from './TableShape';
import { TurnProgressRing } from './TurnProgressRing';
import type { TableVisualMeta } from './FloorPlanCanvas';
import type { VenueTable, VenueSection } from '@/lib/database/floor-plan';

interface DraggableTableProps {
  table: VenueTable;
  section?: VenueSection;
  isSelected: boolean;
  isHighlighted?: boolean;
  overrideColor?: string;
  meta?: TableVisualMeta;
  isTransitioning?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onDoubleClick: (table: VenueTable) => void;
  onResize?: (tableId: string, dw: number, dh: number, dx: number, dy: number) => void;
  readOnly?: boolean;
  dragHover?: boolean;
}

export function DraggableTable({
  table,
  section,
  isSelected,
  isHighlighted,
  overrideColor,
  meta,
  isTransitioning,
  onSelect,
  onDoubleClick,
  onResize,
  readOnly,
  dragHover,
}: DraggableTableProps) {
  // Editor mode only: tables are draggable for repositioning
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `table-${table.id}`,
    data: { type: 'table', table },
    disabled: !!readOnly,
  });

  const isFixture = table.table_number.startsWith('BAR-CTR');
  const showProgressRing = readOnly && meta?.seatedAt && ['seated', 'occupied', 'check_dropped'].includes(meta.status);
  const showVipShimmer = readOnly && meta?.isVip && !isFixture;
  const showArrivalAlert = readOnly && meta?.isArrived && !isFixture;
  const canDrop = dragHover && ['available', 'reserved'].includes(meta?.status || 'available');

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
    cursor: readOnly || isFixture ? 'default' : 'grab',
    transition: isDragging ? undefined : 'box-shadow 150ms ease',
    // Arrival alert animation
    ...(showArrivalAlert ? {
      animation: 'arrival-alert 1s ease-in-out infinite',
      '--glow-color': `${overrideColor || '#3B82F6'}60`,
    } as React.CSSProperties : {}),
    // Transition pulse
    ...(isTransitioning && !showArrivalAlert ? {
      animation: 'table-transition-pulse 400ms ease-out',
    } : {}),
  };

  // In staff mode, use the split's color; otherwise use section color
  const sectionColor = overrideColor || section?.color || '#6B7280';

  return (
    <div
      ref={readOnly ? undefined : setNodeRef}
      style={style}
      className="select-none"
      data-table-id={readOnly ? table.id : undefined}
      data-table-status={readOnly ? (meta?.status || 'available') : undefined}
    >
      {/* Drag surface */}
      <div
        className={`
          w-full h-full
          ${isDragging ? 'opacity-80 scale-105' : ''}
          ${canDrop ? 'ring-2 ring-[#D4622B] ring-offset-1 ring-offset-transparent rounded-full scale-110' : ''}
          ${isSelected && !canDrop ? 'ring-[1.5px] ring-white/60 ring-offset-1 ring-offset-transparent rounded-full' : ''}
          ${isHighlighted && !canDrop ? 'ring-[1.5px] ring-white/40 ring-offset-1 ring-offset-transparent rounded-full' : ''}
          transition-transform duration-150
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
          meta={meta}
        />
      </div>

      {/* VIP gold shimmer overlay */}
      {showVipShimmer && (
        <div
          className="absolute inset-[8%] rounded-full pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.08) 40%, rgba(255,215,0,0.18) 50%, rgba(255,215,0,0.08) 60%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'vip-shimmer 3s ease-in-out infinite',
            zIndex: 25,
            border: '1px solid rgba(255,215,0,0.25)',
          }}
        />
      )}

      {/* Turn-time progress ring */}
      {showProgressRing && meta?.seatedAt && (
        <TurnProgressRing
          seatedAt={meta.seatedAt}
          shape={table.shape}
        />
      )}

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
      className="absolute w-2.5 h-2.5 bg-keva-brass-400 border border-keva-brass-600 rounded-sm z-50 hover:bg-keva-brass-300"
      style={positionStyles}
      onPointerDown={handlePointerDown}
    />
  );
}
