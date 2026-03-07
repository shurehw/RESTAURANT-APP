'use client';

import type { VenueTable } from '@/lib/database/floor-plan';

interface TableShapeProps {
  shape: VenueTable['shape'];
  capacity: number;
  minCapacity?: number;
  sectionColor: string;
  tableNumber: string;
  isSelected: boolean;
}

/**
 * Renders table interior with shape-appropriate visuals and chair indicators.
 * Chairs are absolutely positioned relative to the table element.
 */
export function TableShape({
  shape,
  capacity,
  minCapacity,
  sectionColor,
  tableNumber,
  isSelected,
}: TableShapeProps) {
  const capacityLabel =
    minCapacity && minCapacity > 1 && minCapacity !== capacity
      ? `${minCapacity}-${capacity}`
      : `${capacity}`;

  return (
    <div className="relative w-full h-full">
      {/* Chairs rendered behind table */}
      {shape !== 'bar_seat' && (
        <ChairLayout shape={shape} capacity={capacity} sectionColor={sectionColor} />
      )}

      {/* Table surface */}
      <div
        className={`
          absolute inset-[12%] flex flex-col items-center justify-center
          border-2 transition-colors
          ${getShapeClass(shape)}
        `}
        style={{
          backgroundColor: `${sectionColor}30`,
          borderColor: `${sectionColor}90`,
          boxShadow: isSelected
            ? `0 0 0 2px ${sectionColor}60, inset 0 1px 2px rgba(0,0,0,0.3)`
            : 'inset 0 1px 2px rgba(0,0,0,0.2)',
        }}
      >
        <span className="font-bold text-[10px] leading-none text-white drop-shadow-sm">
          {tableNumber}
        </span>
        <span className="text-[7px] text-gray-400 leading-none mt-0.5">
          {capacityLabel}
        </span>
      </div>
    </div>
  );
}

function getShapeClass(shape: VenueTable['shape']): string {
  switch (shape) {
    case 'round':
    case 'oval':
      return 'rounded-full';
    case 'square':
      return 'rounded-lg';
    case 'rectangle':
      return 'rounded-lg';
    case 'booth':
      return 'rounded-lg';
    case 'bar_seat':
      return 'rounded-full';
    default:
      return 'rounded-lg';
  }
}

// ── Chair Layout ────────────────────────────────────────────────

function ChairLayout({
  shape,
  capacity,
  sectionColor,
}: {
  shape: VenueTable['shape'];
  capacity: number;
  sectionColor: string;
}) {
  const chairs = generateChairPositions(shape, capacity);

  return (
    <>
      {chairs.map((chair, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: '14%',
            height: '14%',
            left: `${chair.x}%`,
            top: `${chair.y}%`,
            backgroundColor: `${sectionColor}40`,
            border: `1px solid ${sectionColor}60`,
            transform: `translate(-50%, -50%)`,
          }}
        />
      ))}
    </>
  );
}

function generateChairPositions(
  shape: VenueTable['shape'],
  capacity: number,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];

  switch (shape) {
    case 'round':
    case 'oval': {
      // Place chairs evenly around the perimeter
      const cx = 50;
      const cy = 50;
      const rx = shape === 'oval' ? 46 : 42;
      const ry = 42;
      for (let i = 0; i < capacity; i++) {
        const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
        positions.push({
          x: cx + rx * Math.cos(angle),
          y: cy + ry * Math.sin(angle),
        });
      }
      break;
    }

    case 'square': {
      // Distribute chairs evenly on all 4 sides
      const perSide = Math.ceil(capacity / 4);
      let placed = 0;
      // Top
      for (let i = 0; i < perSide && placed < capacity; i++) {
        positions.push({ x: 20 + (60 / (perSide + 1)) * (i + 1), y: 5 });
        placed++;
      }
      // Bottom
      for (let i = 0; i < perSide && placed < capacity; i++) {
        positions.push({ x: 20 + (60 / (perSide + 1)) * (i + 1), y: 95 });
        placed++;
      }
      // Left
      for (let i = 0; i < perSide && placed < capacity; i++) {
        positions.push({ x: 5, y: 20 + (60 / (perSide + 1)) * (i + 1) });
        placed++;
      }
      // Right
      for (let i = 0; i < perSide && placed < capacity; i++) {
        positions.push({ x: 95, y: 20 + (60 / (perSide + 1)) * (i + 1) });
        placed++;
      }
      break;
    }

    case 'rectangle': {
      // Chairs along both long edges
      const perRow = Math.ceil(capacity / 2);
      for (let i = 0; i < perRow; i++) {
        const x = 15 + (70 / (perRow + 1)) * (i + 1);
        positions.push({ x, y: 5 }); // top
        if (positions.length < capacity) {
          positions.push({ x, y: 95 }); // bottom
        }
      }
      break;
    }

    case 'booth': {
      // Chairs only on one side (bottom = open side, top = banquette back)
      for (let i = 0; i < capacity; i++) {
        const x = 12 + (76 / (capacity + 1)) * (i + 1);
        positions.push({ x, y: 95 });
      }
      break;
    }

    default:
      break;
  }

  return positions;
}

// ── Default Size Helper ─────────────────────────────────────────

/** Returns default width/height (%) based on shape and capacity. Used when creating new tables. */
export function getDefaultTableSize(
  shape: VenueTable['shape'],
  capacity: number,
): { width: number; height: number } {
  switch (shape) {
    case 'round': {
      const size = Math.min(10, 3.5 + capacity * 0.7);
      return { width: size, height: size };
    }
    case 'oval': {
      const h = Math.min(10, 3.5 + capacity * 0.7);
      return { width: h * 1.5, height: h };
    }
    case 'rectangle':
      return {
        width: Math.min(16, 4 + capacity * 0.8),
        height: Math.min(8, 3.5 + capacity * 0.3),
      };
    case 'booth':
      return {
        width: Math.min(16, 4 + capacity * 0.8),
        height: Math.min(7, 3 + capacity * 0.3),
      };
    case 'square': {
      const sq = Math.min(10, 3.5 + capacity * 0.5);
      return { width: sq, height: sq };
    }
    case 'bar_seat':
      return { width: 2.5, height: 2.5 };
    default:
      return { width: 6, height: 6 };
  }
}
