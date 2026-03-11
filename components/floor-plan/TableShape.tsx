'use client';

import type { VenueTable } from '@/lib/database/floor-plan';
import type { TableVisualMeta } from './FloorPlanCanvas';

interface TableShapeProps {
  shape: VenueTable['shape'];
  capacity: number;
  minCapacity?: number;
  sectionColor: string;
  tableNumber: string;
  isSelected: boolean;
  meta?: TableVisualMeta;
}

/**
 * Renders architectural table shapes using SVG.
 * Realistic top-down view inspired by The Nice Guy LA:
 * polished wood surfaces with center highlights, cushioned leather chairs,
 * filled crescent booth banquettes, chrome-framed bar stools.
 */
export function TableShape({
  shape,
  capacity,
  minCapacity,
  sectionColor,
  tableNumber,
  isSelected,
  meta,
}: TableShapeProps) {
  // ── Fixture rendering (bar counter, walls) ──
  if (tableNumber.startsWith('BAR-CTR')) {
    return (
      <div className="relative w-full h-full">
        <div
          className="absolute inset-[2%] rounded-[4px]"
          style={{
            background: 'linear-gradient(135deg, #2a2a3e 0%, #1e1e30 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    );
  }

  const capacityLabel =
    minCapacity && minCapacity > 1 && minCapacity !== capacity
      ? `${minCapacity}–${capacity}`
      : `${capacity}`;

  const glowStyle = getGlowStyle(meta, sectionColor);

  // Realistic, solid fills — high opacity for dimensional look
  const surfaceFill = `${sectionColor}${getSpendHex(meta, 0x65)}`;
  const surfaceHighlight = `${sectionColor}20`;
  const surfaceStroke = `${sectionColor}85`;
  const chairFill = `${sectionColor}55`;
  const chairHighlight = `${sectionColor}30`;
  const chairStroke = `${sectionColor}68`;

  const isRound = shape === 'round' || shape === 'oval' || shape === 'bar_seat';

  return (
    <div
      className="relative w-full h-full"
      style={{
        ...glowStyle,
        borderRadius: isRound ? '50%' : '14%',
      }}
    >
      {/* SVG architectural rendering */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        style={{
          filter: isSelected
            ? `drop-shadow(0 0 10px ${sectionColor}60)`
            : 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
        }}
      >
        {shape === 'round' && (
          <RoundTableSVG capacity={capacity} surfaceFill={surfaceFill} surfaceHighlight={surfaceHighlight} surfaceStroke={surfaceStroke} chairFill={chairFill} chairHighlight={chairHighlight} chairStroke={chairStroke} />
        )}
        {shape === 'oval' && (
          <OvalTableSVG capacity={capacity} surfaceFill={surfaceFill} surfaceHighlight={surfaceHighlight} surfaceStroke={surfaceStroke} chairFill={chairFill} chairHighlight={chairHighlight} chairStroke={chairStroke} />
        )}
        {shape === 'booth' && (
          <BoothTableSVG capacity={capacity} surfaceFill={surfaceFill} surfaceHighlight={surfaceHighlight} surfaceStroke={surfaceStroke} chairFill={chairFill} chairHighlight={chairHighlight} chairStroke={chairStroke} color={sectionColor} />
        )}
        {shape === 'square' && (
          <SquareTableSVG capacity={capacity} surfaceFill={surfaceFill} surfaceHighlight={surfaceHighlight} surfaceStroke={surfaceStroke} chairFill={chairFill} chairHighlight={chairHighlight} chairStroke={chairStroke} />
        )}
        {shape === 'rectangle' && (
          <RectTableSVG capacity={capacity} surfaceFill={surfaceFill} surfaceHighlight={surfaceHighlight} surfaceStroke={surfaceStroke} chairFill={chairFill} chairHighlight={chairHighlight} chairStroke={chairStroke} />
        )}
        {shape === 'bar_seat' && (
          <BarStoolSVG surfaceFill={surfaceFill} surfaceStroke={surfaceStroke} color={sectionColor} />
        )}
      </svg>

      {/* Text overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ paddingTop: shape === 'booth' ? '14%' : undefined }}
      >
        <span
          className="font-semibold leading-none text-white"
          style={{
            fontSize: shape === 'bar_seat' ? '8px' : '11px',
            letterSpacing: '0.02em',
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          }}
        >
          {tableNumber}
        </span>
        {shape !== 'bar_seat' && (
          <span
            className="leading-none mt-0.5"
            style={{
              fontSize: '7px',
              color: `${sectionColor}CC`,
              letterSpacing: '0.03em',
            }}
          >
            {capacityLabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ── SVG Shape Components ─────────────────────────────────────────

interface ShapeSVGProps {
  capacity: number;
  surfaceFill: string;
  surfaceHighlight: string;
  surfaceStroke: string;
  chairFill: string;
  chairHighlight: string;
  chairStroke: string;
}

/** Round table: polished wood circle + cushioned chair seats around perimeter */
function RoundTableSVG({ capacity, surfaceFill, surfaceHighlight, surfaceStroke, chairFill, chairHighlight, chairStroke }: ShapeSVGProps) {
  const cx = 50, cy = 50;
  const tableR = 24;
  const chairR = 42;
  const chairW = 16, chairH = 9;

  return (
    <>
      {/* Cushioned chair seats — tangentially oriented */}
      {Array.from({ length: capacity }, (_, i) => {
        const angleDeg = (360 * i) / capacity - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = cx + chairR * Math.cos(angleRad);
        const y = cy + chairR * Math.sin(angleRad);
        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${angleDeg + 90})`}>
            {/* Chair frame */}
            <rect
              x={-chairW / 2} y={-chairH / 2}
              width={chairW} height={chairH}
              rx={3.5}
              fill={chairFill}
              stroke={chairStroke}
              strokeWidth={1}
            />
            {/* Cushion pad */}
            <rect
              x={-chairW / 2 + 2} y={-chairH / 2 + 1.5}
              width={chairW - 4} height={chairH - 3}
              rx={2}
              fill={chairHighlight}
            />
          </g>
        );
      })}
      {/* Table surface — polished wood */}
      <circle cx={cx} cy={cy} r={tableR} fill={surfaceFill} stroke={surfaceStroke} strokeWidth={2} />
      {/* Center highlight — overhead light reflection */}
      <circle cx={cx} cy={cy} r={tableR * 0.55} fill={surfaceHighlight} />
      {/* Rim bevel */}
      <circle cx={cx} cy={cy} r={tableR - 1.5} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
    </>
  );
}

/** Oval table: elliptical polished wood + cushioned chairs */
function OvalTableSVG({ capacity, surfaceFill, surfaceHighlight, surfaceStroke, chairFill, chairHighlight, chairStroke }: ShapeSVGProps) {
  const cx = 50, cy = 50;
  const tableRx = 30, tableRy = 22;
  const chairRx = 46, chairRy = 40;
  const chairW = 15, chairH = 8;

  return (
    <>
      {Array.from({ length: capacity }, (_, i) => {
        const angleDeg = (360 * i) / capacity - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = cx + chairRx * Math.cos(angleRad);
        const y = cy + chairRy * Math.sin(angleRad);
        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${angleDeg + 90})`}>
            <rect
              x={-chairW / 2} y={-chairH / 2}
              width={chairW} height={chairH}
              rx={3}
              fill={chairFill}
              stroke={chairStroke}
              strokeWidth={1}
            />
            <rect
              x={-chairW / 2 + 2} y={-chairH / 2 + 1.5}
              width={chairW - 4} height={chairH - 3}
              rx={2}
              fill={chairHighlight}
            />
          </g>
        );
      })}
      {/* Elliptical table surface */}
      <ellipse cx={cx} cy={cy} rx={tableRx} ry={tableRy} fill={surfaceFill} stroke={surfaceStroke} strokeWidth={2} />
      {/* Center highlight */}
      <ellipse cx={cx} cy={cy} rx={tableRx * 0.55} ry={tableRy * 0.55} fill={surfaceHighlight} />
      {/* Rim bevel */}
      <ellipse cx={cx} cy={cy} rx={tableRx - 1.5} ry={tableRy - 1.5} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
    </>
  );
}

/** Booth: filled crescent banquette + polished table surface */
function BoothTableSVG({ capacity, surfaceFill, surfaceHighlight, surfaceStroke, chairFill, chairHighlight, chairStroke, color }: ShapeSVGProps & { color: string }) {
  return (
    <>
      {/* Banquette — filled crescent (outer curve down, inner curve back up, close) */}
      <path
        d="M 6,82 C 6,10 94,10 94,82 L 84,78 C 84,24 16,24 16,78 Z"
        fill={chairFill}
        stroke={chairStroke}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* Banquette cushion highlight — inner upholstery pad */}
      <path
        d="M 12,79 C 12,18 88,18 88,79 L 80,76 C 80,28 20,28 20,76 Z"
        fill={chairHighlight}
      />
      {/* Tufting seams */}
      {[35, 50, 65].map((xPos) => (
        <line
          key={xPos}
          x1={xPos} y1={26} x2={xPos} y2={76}
          stroke={`${color}12`}
          strokeWidth={0.7}
          strokeLinecap="round"
        />
      ))}
      {/* Table surface */}
      <rect
        x={18} y={46}
        width={64} height={30}
        rx={5}
        fill={surfaceFill}
        stroke={surfaceStroke}
        strokeWidth={2}
      />
      {/* Table center highlight */}
      <rect
        x={26} y={52}
        width={48} height={18}
        rx={3}
        fill={surfaceHighlight}
      />
      {/* Open-side cushioned chairs (bottom) */}
      {Array.from({ length: Math.min(capacity, 4) }, (_, i) => {
        const x = 22 + (56 / (Math.min(capacity, 4) + 1)) * (i + 1);
        return (
          <g key={i}>
            <rect
              x={x - 7} y={82}
              width={14} height={9}
              rx={3.5}
              fill={chairFill}
              stroke={chairStroke}
              strokeWidth={1}
            />
            <rect
              x={x - 5} y={83.5}
              width={10} height={6}
              rx={2}
              fill={chairHighlight}
            />
          </g>
        );
      })}
    </>
  );
}

/** Square table: polished wood surface + cushioned chairs on 4 sides */
function SquareTableSVG({ capacity, surfaceFill, surfaceHighlight, surfaceStroke, chairFill, chairHighlight, chairStroke }: ShapeSVGProps) {
  const inset = 18;
  const size = 100 - 2 * inset;
  const perSide = Math.ceil(capacity / 4);
  const chairs: React.ReactNode[] = [];
  let placed = 0;

  const cW = 14, cH = 8; // chair long / short dimensions

  // Top
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const x = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(
      <g key={`t${i}`}>
        <rect x={x - cW / 2} y={2} width={cW} height={cH} rx={3.5} fill={chairFill} stroke={chairStroke} strokeWidth={1} />
        <rect x={x - cW / 2 + 2} y={3.5} width={cW - 4} height={cH - 3} rx={2} fill={chairHighlight} />
      </g>
    );
    placed++;
  }
  // Bottom
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const x = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(
      <g key={`b${i}`}>
        <rect x={x - cW / 2} y={90} width={cW} height={cH} rx={3.5} fill={chairFill} stroke={chairStroke} strokeWidth={1} />
        <rect x={x - cW / 2 + 2} y={91.5} width={cW - 4} height={cH - 3} rx={2} fill={chairHighlight} />
      </g>
    );
    placed++;
  }
  // Left
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const y = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(
      <g key={`l${i}`}>
        <rect x={2} y={y - cW / 2} width={cH} height={cW} rx={3.5} fill={chairFill} stroke={chairStroke} strokeWidth={1} />
        <rect x={3.5} y={y - cW / 2 + 2} width={cH - 3} height={cW - 4} rx={2} fill={chairHighlight} />
      </g>
    );
    placed++;
  }
  // Right
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const y = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(
      <g key={`r${i}`}>
        <rect x={90} y={y - cW / 2} width={cH} height={cW} rx={3.5} fill={chairFill} stroke={chairStroke} strokeWidth={1} />
        <rect x={91.5} y={y - cW / 2 + 2} width={cH - 3} height={cW - 4} rx={2} fill={chairHighlight} />
      </g>
    );
    placed++;
  }

  return (
    <>
      {chairs}
      {/* Table surface */}
      <rect x={inset} y={inset} width={size} height={size} rx={6} fill={surfaceFill} stroke={surfaceStroke} strokeWidth={2} />
      {/* Center highlight */}
      <rect x={inset + 8} y={inset + 8} width={size - 16} height={size - 16} rx={4} fill={surfaceHighlight} />
      {/* Rim bevel */}
      <rect x={inset + 1.5} y={inset + 1.5} width={size - 3} height={size - 3} rx={5} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
    </>
  );
}

/** Rectangle table: polished wood surface + cushioned chairs on long sides */
function RectTableSVG({ capacity, surfaceFill, surfaceHighlight, surfaceStroke, chairFill, chairHighlight, chairStroke }: ShapeSVGProps) {
  const perRow = Math.ceil(capacity / 2);
  const chairs: React.ReactNode[] = [];
  let placed = 0;
  const cW = 14, cH = 8;

  for (let i = 0; i < perRow; i++) {
    const x = 10 + (80 / (perRow + 1)) * (i + 1);
    // Top chair
    chairs.push(
      <g key={`t${i}`}>
        <rect x={x - cW / 2} y={2} width={cW} height={cH} rx={3.5} fill={chairFill} stroke={chairStroke} strokeWidth={1} />
        <rect x={x - cW / 2 + 2} y={3.5} width={cW - 4} height={cH - 3} rx={2} fill={chairHighlight} />
      </g>
    );
    placed++;
    if (placed < capacity) {
      // Bottom chair
      chairs.push(
        <g key={`b${i}`}>
          <rect x={x - cW / 2} y={90} width={cW} height={cH} rx={3.5} fill={chairFill} stroke={chairStroke} strokeWidth={1} />
          <rect x={x - cW / 2 + 2} y={91.5} width={cW - 4} height={cH - 3} rx={2} fill={chairHighlight} />
        </g>
      );
      placed++;
    }
  }

  return (
    <>
      {chairs}
      {/* Table surface */}
      <rect x={8} y={16} width={84} height={68} rx={6} fill={surfaceFill} stroke={surfaceStroke} strokeWidth={2} />
      {/* Center highlight */}
      <rect x={16} y={24} width={68} height={52} rx={4} fill={surfaceHighlight} />
      {/* Rim bevel */}
      <rect x={9.5} y={17.5} width={81} height={65} rx={5} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
    </>
  );
}

/** Bar stool: chrome frame + leather cushion — top-down view */
function BarStoolSVG({ surfaceFill, surfaceStroke, color }: { surfaceFill: string; surfaceStroke: string; color: string }) {
  return (
    <>
      {/* Outer ring / chrome frame */}
      <circle cx={50} cy={50} r={42} fill="none" stroke={`${color}45`} strokeWidth={4} />
      {/* Footrest ring */}
      <circle cx={50} cy={50} r={38} fill="none" stroke={`${color}15`} strokeWidth={1} />
      {/* Seat cushion — leather pad */}
      <circle cx={50} cy={50} r={32} fill={surfaceFill} stroke={surfaceStroke} strokeWidth={2} />
      {/* Cushion highlight — center reflection */}
      <circle cx={50} cy={50} r={20} fill={`${color}18`} />
      {/* Stitching ring detail */}
      <circle cx={50} cy={50} r={26} fill="none" stroke={`${color}12`} strokeWidth={0.8} strokeDasharray="4 3" />
      {/* Center swivel bolt */}
      <circle cx={50} cy={50} r={5} fill={`${color}25`} stroke={`${color}35`} strokeWidth={1} />
    </>
  );
}

// ── Ambient Glow + Spend Helpers ──────────────────────────────

/** Returns CSS properties for the breathing glow animation based on table status */
function getGlowStyle(meta: TableVisualMeta | undefined, color: string): React.CSSProperties {
  if (!meta || meta.status === 'blocked') return {};

  const glowConfig: Record<string, { duration: string; opacityHex: string } | null> = {
    available:     { duration: '4s', opacityHex: '25' },
    reserved:      { duration: '2.5s', opacityHex: '40' },
    seated:        null,
    occupied:      null,
    check_dropped: { duration: '1.5s', opacityHex: '40' },
    bussing:       { duration: '1.5s', opacityHex: '4D' },
  };

  const cfg = glowConfig[meta.status];
  const opHex = cfg?.opacityHex || '33';

  const base: React.CSSProperties & Record<string, string> = {
    '--glow-color': `${color}${opHex}`,
    '--glow-min': '8px',
    '--glow-spread-min': '2px',
    '--glow-max': '18px',
    '--glow-spread-max': '5px',
  };

  if (cfg) {
    base.animation = `table-breathe ${cfg.duration} ease-in-out infinite`;
  } else if (meta.status === 'seated' || meta.status === 'occupied') {
    base.boxShadow = `0 0 10px 2px ${color}${opHex}`;
  }

  return base;
}

/** Scale hex opacity for spend intensity (higher spend = more opaque surface) */
function getSpendHex(meta: TableVisualMeta | undefined, base: number): string {
  if (!meta?.spendIntensity) return base.toString(16).padStart(2, '0');
  const boosted = Math.min(0xFF, Math.round(base + 0x20 * meta.spendIntensity));
  return boosted.toString(16).padStart(2, '0');
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
