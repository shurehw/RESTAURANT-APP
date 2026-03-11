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

// ── Material Palette (The Nice Guy LA) ──────────────────────────
// Dark walnut wood, leather upholstery, brass accents, candlelight
const WALNUT      = '#2a1d14';   // dark walnut table surface
const WALNUT_LITE = '#3d2b1e';   // lighter walnut (highlight)
const WALNUT_RIM  = '#4a3628';   // edge bevel
const LEATHER     = '#1e1610';   // dark leather base
const LEATHER_PAD = '#2c2018';   // cushion highlight
const LEATHER_RIM = '#3a2a1e';   // chair edge
const BRASS       = '#8B7355';   // brass edge accent
const BRASS_GLOW  = '#C9A96E';   // warm brass highlight
const CANDLE      = '#F5DEB3';   // candlelight warm glow
const CHROME      = '#5a5a6a';   // bar stool chrome
const CHROME_LITE = '#7a7a8a';   // chrome highlight

/**
 * Renders architectural table shapes using SVG.
 * Material-based rendering inspired by The Nice Guy LA:
 * dark walnut surfaces, leather-cushioned seating, brass edge accents,
 * warm candlelight centerpieces. Section color shows as ambient underglow only.
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
            background: 'linear-gradient(135deg, #1a1a2e 0%, #12121e 50%, #1a1a2e 100%)',
            border: `1px solid ${BRASS}30`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.4), inset 0 0 20px rgba(0,0,0,0.3)`,
          }}
        />
        {/* Brass bar rail */}
        <div
          className="absolute left-[4%] right-[4%] bottom-[8%] h-[3%] rounded-full"
          style={{ background: `linear-gradient(90deg, ${BRASS}40, ${BRASS}70, ${BRASS}40)` }}
        />
      </div>
    );
  }

  const capacityLabel =
    minCapacity && minCapacity > 1 && minCapacity !== capacity
      ? `${minCapacity}–${capacity}`
      : `${capacity}`;

  const glowStyle = getGlowStyle(meta, sectionColor);
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
            ? `drop-shadow(0 0 12px ${sectionColor}50) drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
            : 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
        }}
      >
        {shape === 'round' && <RoundTableSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'oval' && <OvalTableSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'booth' && <BoothTableSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'square' && <SquareTableSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'rectangle' && <RectTableSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'half_circle' && <HalfCircleBoothSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'pullman' && <PullmanBoothSVG capacity={capacity} sectionColor={sectionColor} />}
        {shape === 'bar_seat' && <BarStoolSVG sectionColor={sectionColor} />}
      </svg>

      {/* Section color underglow — subtle ambient tint */}
      <div
        className="absolute inset-[15%] pointer-events-none"
        style={{
          borderRadius: isRound ? '50%' : '20%',
          background: `radial-gradient(ellipse at center, ${sectionColor}18 0%, transparent 70%)`,
        }}
      />

      {/* Text overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ paddingTop: (shape === 'booth' || shape === 'half_circle') ? '14%' : undefined }}
      >
        <span
          className="font-semibold leading-none"
          style={{
            fontSize: shape === 'bar_seat' ? '8px' : '11px',
            letterSpacing: '0.02em',
            color: CANDLE,
            textShadow: `0 1px 3px rgba(0,0,0,0.7), 0 0 8px ${CANDLE}30`,
          }}
        >
          {tableNumber}
        </span>
        {shape !== 'bar_seat' && (
          <span
            className="leading-none mt-0.5"
            style={{
              fontSize: '7px',
              color: `${BRASS_GLOW}AA`,
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
  sectionColor: string;
}

/** Round table: walnut circle + leather chair seats + brass rim + candlelight */
function RoundTableSVG({ capacity, sectionColor }: ShapeSVGProps) {
  const cx = 50, cy = 50;
  const tableR = 24;
  const chairR = 42;
  const chairW = 16, chairH = 9;

  return (
    <>
      {/* Leather chair seats — tangentially oriented */}
      {Array.from({ length: capacity }, (_, i) => {
        const angleDeg = (360 * i) / capacity - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = cx + chairR * Math.cos(angleRad);
        const y = cy + chairR * Math.sin(angleRad);
        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${angleDeg + 90})`}>
            {/* Chair frame — dark wood */}
            <rect
              x={-chairW / 2} y={-chairH / 2}
              width={chairW} height={chairH}
              rx={3.5}
              fill={LEATHER}
              stroke={LEATHER_RIM}
              strokeWidth={1}
            />
            {/* Leather cushion pad */}
            <rect
              x={-chairW / 2 + 2} y={-chairH / 2 + 1.5}
              width={chairW - 4} height={chairH - 3}
              rx={2}
              fill={LEATHER_PAD}
            />
            {/* Section color tint on cushion */}
            <rect
              x={-chairW / 2 + 2} y={-chairH / 2 + 1.5}
              width={chairW - 4} height={chairH - 3}
              rx={2}
              fill={`${sectionColor}15`}
            />
          </g>
        );
      })}
      {/* Table surface — dark walnut */}
      <circle cx={cx} cy={cy} r={tableR} fill={WALNUT} stroke={BRASS} strokeWidth={1.5} />
      {/* Wood grain highlight */}
      <circle cx={cx} cy={cy} r={tableR - 3} fill={WALNUT_LITE} opacity={0.3} />
      {/* Brass rim accent */}
      <circle cx={cx} cy={cy} r={tableR - 0.75} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight centerpiece */}
      <circle cx={cx} cy={cy} r={3} fill={CANDLE} opacity={0.25} />
      <circle cx={cx} cy={cy} r={1.5} fill={CANDLE} opacity={0.5} />
    </>
  );
}

/** Oval table: walnut ellipse + leather chairs + brass trim */
function OvalTableSVG({ capacity, sectionColor }: ShapeSVGProps) {
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
              fill={LEATHER}
              stroke={LEATHER_RIM}
              strokeWidth={1}
            />
            <rect
              x={-chairW / 2 + 2} y={-chairH / 2 + 1.5}
              width={chairW - 4} height={chairH - 3}
              rx={2}
              fill={LEATHER_PAD}
            />
            <rect
              x={-chairW / 2 + 2} y={-chairH / 2 + 1.5}
              width={chairW - 4} height={chairH - 3}
              rx={2}
              fill={`${sectionColor}15`}
            />
          </g>
        );
      })}
      {/* Walnut surface */}
      <ellipse cx={cx} cy={cy} rx={tableRx} ry={tableRy} fill={WALNUT} stroke={BRASS} strokeWidth={1.5} />
      <ellipse cx={cx} cy={cy} rx={tableRx - 3} ry={tableRy - 3} fill={WALNUT_LITE} opacity={0.3} />
      <ellipse cx={cx} cy={cy} rx={tableRx - 0.75} ry={tableRy - 0.75} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight */}
      <circle cx={cx} cy={cy} r={3} fill={CANDLE} opacity={0.25} />
      <circle cx={cx} cy={cy} r={1.5} fill={CANDLE} opacity={0.5} />
    </>
  );
}

/** Booth: leather banquette crescent + walnut table + brass trim + tufting */
function BoothTableSVG({ capacity, sectionColor }: ShapeSVGProps) {
  return (
    <>
      {/* Banquette — filled leather crescent */}
      <path
        d="M 6,82 C 6,10 94,10 94,82 L 84,78 C 84,24 16,24 16,78 Z"
        fill={LEATHER}
        stroke={LEATHER_RIM}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* Cushion pad — lighter leather */}
      <path
        d="M 12,79 C 12,18 88,18 88,79 L 80,76 C 80,28 20,28 20,76 Z"
        fill={LEATHER_PAD}
      />
      {/* Section tint on banquette */}
      <path
        d="M 12,79 C 12,18 88,18 88,79 L 80,76 C 80,28 20,28 20,76 Z"
        fill={`${sectionColor}12`}
      />
      {/* Tufting buttons — diamond pattern */}
      {[30, 42, 50, 58, 70].map((xPos) => (
        <g key={xPos}>
          <circle cx={xPos} cy={42} r={1.8} fill={LEATHER_RIM} stroke={LEATHER} strokeWidth={0.5} />
          <circle cx={xPos} cy={42} r={0.8} fill={BRASS_GLOW} opacity={0.3} />
        </g>
      ))}
      {[36, 46, 54, 64].map((xPos) => (
        <g key={`b${xPos}`}>
          <circle cx={xPos} cy={52} r={1.8} fill={LEATHER_RIM} stroke={LEATHER} strokeWidth={0.5} />
          <circle cx={xPos} cy={52} r={0.8} fill={BRASS_GLOW} opacity={0.3} />
        </g>
      ))}
      {/* Walnut table surface */}
      <rect
        x={18} y={56}
        width={64} height={24}
        rx={4}
        fill={WALNUT}
        stroke={BRASS}
        strokeWidth={1.5}
      />
      {/* Wood grain highlight */}
      <rect x={24} y={60} width={52} height={16} rx={3} fill={WALNUT_LITE} opacity={0.3} />
      {/* Brass rim */}
      <rect x={18.75} y={56.75} width={62.5} height={22.5} rx={3.5} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight on table */}
      <circle cx={50} cy={68} r={2.5} fill={CANDLE} opacity={0.2} />
      <circle cx={50} cy={68} r={1.2} fill={CANDLE} opacity={0.45} />
      {/* Open-side leather chairs (bottom) */}
      {Array.from({ length: Math.min(capacity, 4) }, (_, i) => {
        const x = 22 + (56 / (Math.min(capacity, 4) + 1)) * (i + 1);
        return (
          <g key={i}>
            <rect
              x={x - 7} y={86}
              width={14} height={9}
              rx={3.5}
              fill={LEATHER}
              stroke={LEATHER_RIM}
              strokeWidth={1}
            />
            <rect
              x={x - 5} y={87.5}
              width={10} height={6}
              rx={2}
              fill={LEATHER_PAD}
            />
            <rect
              x={x - 5} y={87.5}
              width={10} height={6}
              rx={2}
              fill={`${sectionColor}15`}
            />
          </g>
        );
      })}
    </>
  );
}

/** Square table: walnut surface + leather chairs + brass trim */
function SquareTableSVG({ capacity, sectionColor }: ShapeSVGProps) {
  const inset = 18;
  const size = 100 - 2 * inset;
  const perSide = Math.ceil(capacity / 4);
  const chairs: React.ReactNode[] = [];
  let placed = 0;

  const cW = 14, cH = 8;

  const makeChair = (key: string, x: number, y: number, vertical: boolean) => (
    <g key={key}>
      <rect
        x={vertical ? x : x} y={vertical ? y : y}
        width={vertical ? cH : cW} height={vertical ? cW : cH}
        rx={3.5} fill={LEATHER} stroke={LEATHER_RIM} strokeWidth={1}
      />
      <rect
        x={vertical ? x + 1.5 : x + 2} y={vertical ? y + 2 : y + 1.5}
        width={vertical ? cH - 3 : cW - 4} height={vertical ? cW - 4 : cH - 3}
        rx={2} fill={LEATHER_PAD}
      />
      <rect
        x={vertical ? x + 1.5 : x + 2} y={vertical ? y + 2 : y + 1.5}
        width={vertical ? cH - 3 : cW - 4} height={vertical ? cW - 4 : cH - 3}
        rx={2} fill={`${sectionColor}15`}
      />
    </g>
  );

  // Top
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const x = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(makeChair(`t${i}`, x - cW / 2, 2, false));
    placed++;
  }
  // Bottom
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const x = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(makeChair(`b${i}`, x - cW / 2, 90, false));
    placed++;
  }
  // Left
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const y = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(makeChair(`l${i}`, 2, y - cW / 2, true));
    placed++;
  }
  // Right
  for (let i = 0; i < perSide && placed < capacity; i++) {
    const y = inset + (size / (perSide + 1)) * (i + 1);
    chairs.push(makeChair(`r${i}`, 90, y - cW / 2, true));
    placed++;
  }

  return (
    <>
      {chairs}
      {/* Walnut surface */}
      <rect x={inset} y={inset} width={size} height={size} rx={5} fill={WALNUT} stroke={BRASS} strokeWidth={1.5} />
      <rect x={inset + 6} y={inset + 6} width={size - 12} height={size - 12} rx={3} fill={WALNUT_LITE} opacity={0.3} />
      <rect x={inset + 0.75} y={inset + 0.75} width={size - 1.5} height={size - 1.5} rx={4.5} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight */}
      <circle cx={50} cy={50} r={2.5} fill={CANDLE} opacity={0.2} />
      <circle cx={50} cy={50} r={1.2} fill={CANDLE} opacity={0.45} />
    </>
  );
}

/** Rectangle table: walnut surface + leather chairs on long sides */
function RectTableSVG({ capacity, sectionColor }: ShapeSVGProps) {
  const perRow = Math.ceil(capacity / 2);
  const chairs: React.ReactNode[] = [];
  let placed = 0;
  const cW = 14, cH = 8;

  for (let i = 0; i < perRow; i++) {
    const x = 10 + (80 / (perRow + 1)) * (i + 1);
    // Top chair
    chairs.push(
      <g key={`t${i}`}>
        <rect x={x - cW / 2} y={2} width={cW} height={cH} rx={3.5} fill={LEATHER} stroke={LEATHER_RIM} strokeWidth={1} />
        <rect x={x - cW / 2 + 2} y={3.5} width={cW - 4} height={cH - 3} rx={2} fill={LEATHER_PAD} />
        <rect x={x - cW / 2 + 2} y={3.5} width={cW - 4} height={cH - 3} rx={2} fill={`${sectionColor}15`} />
      </g>
    );
    placed++;
    if (placed < capacity) {
      // Bottom chair
      chairs.push(
        <g key={`b${i}`}>
          <rect x={x - cW / 2} y={90} width={cW} height={cH} rx={3.5} fill={LEATHER} stroke={LEATHER_RIM} strokeWidth={1} />
          <rect x={x - cW / 2 + 2} y={91.5} width={cW - 4} height={cH - 3} rx={2} fill={LEATHER_PAD} />
          <rect x={x - cW / 2 + 2} y={91.5} width={cW - 4} height={cH - 3} rx={2} fill={`${sectionColor}15`} />
        </g>
      );
      placed++;
    }
  }

  return (
    <>
      {chairs}
      {/* Walnut surface */}
      <rect x={8} y={16} width={84} height={68} rx={5} fill={WALNUT} stroke={BRASS} strokeWidth={1.5} />
      <rect x={14} y={22} width={72} height={56} rx={3} fill={WALNUT_LITE} opacity={0.3} />
      <rect x={8.75} y={16.75} width={82.5} height={66.5} rx={4.5} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight */}
      <circle cx={50} cy={50} r={2.5} fill={CANDLE} opacity={0.2} />
      <circle cx={50} cy={50} r={1.2} fill={CANDLE} opacity={0.45} />
    </>
  );
}

/** Pullman booth: two parallel banquettes facing each other with walnut table between */
function PullmanBoothSVG({ capacity, sectionColor }: ShapeSVGProps) {
  const bH = 14; // banquette height
  const gap = 3;  // gap between banquette and table

  // Top banquette
  const topY = 2;
  // Bottom banquette
  const botY = 100 - bH - 2;
  // Table fills the middle
  const tableY = topY + bH + gap;
  const tableH = botY - gap - tableY;

  // Tufting buttons per banquette
  const buttonXs = [24, 38, 50, 62, 76];

  return (
    <>
      {/* ── Top banquette ── */}
      <rect x={6} y={topY} width={88} height={bH} rx={4} fill={LEATHER} stroke={LEATHER_RIM} strokeWidth={1} />
      <rect x={10} y={topY + 2} width={80} height={bH - 4} rx={3} fill={LEATHER_PAD} />
      <rect x={10} y={topY + 2} width={80} height={bH - 4} rx={3} fill={`${sectionColor}10`} />
      {/* Tufting buttons */}
      {buttonXs.map((bx) => (
        <g key={`t${bx}`}>
          <circle cx={bx} cy={topY + bH / 2} r={1.5} fill={LEATHER_RIM} stroke={LEATHER} strokeWidth={0.4} />
          <circle cx={bx} cy={topY + bH / 2} r={0.6} fill={BRASS_GLOW} opacity={0.3} />
        </g>
      ))}

      {/* ── Bottom banquette ── */}
      <rect x={6} y={botY} width={88} height={bH} rx={4} fill={LEATHER} stroke={LEATHER_RIM} strokeWidth={1} />
      <rect x={10} y={botY + 2} width={80} height={bH - 4} rx={3} fill={LEATHER_PAD} />
      <rect x={10} y={botY + 2} width={80} height={bH - 4} rx={3} fill={`${sectionColor}10`} />
      {/* Tufting buttons */}
      {buttonXs.map((bx) => (
        <g key={`b${bx}`}>
          <circle cx={bx} cy={botY + bH / 2} r={1.5} fill={LEATHER_RIM} stroke={LEATHER} strokeWidth={0.4} />
          <circle cx={bx} cy={botY + bH / 2} r={0.6} fill={BRASS_GLOW} opacity={0.3} />
        </g>
      ))}

      {/* ── Walnut table between banquettes ── */}
      <rect x={12} y={tableY} width={76} height={tableH} rx={4} fill={WALNUT} stroke={BRASS} strokeWidth={1.5} />
      {/* Wood grain highlight */}
      <rect x={18} y={tableY + 5} width={64} height={tableH - 10} rx={3} fill={WALNUT_LITE} opacity={0.3} />
      {/* Brass rim accent */}
      <rect x={12.75} y={tableY + 0.75} width={74.5} height={tableH - 1.5} rx={3.5} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight */}
      <circle cx={50} cy={50} r={2.5} fill={CANDLE} opacity={0.2} />
      <circle cx={50} cy={50} r={1.2} fill={CANDLE} opacity={0.45} />
    </>
  );
}

/** Half-circle booth: semicircular leather banquette + round walnut table */
function HalfCircleBoothSVG({ capacity, sectionColor }: ShapeSVGProps) {
  const cx = 50;
  // Banquette arc center at y=56, outer radius ~45, inner radius ~33
  const arcY = 56;
  const outerR = 45;
  const innerR = 33;

  // Tufting button positions along the banquette midline
  const midR = (outerR + innerR) / 2;
  const buttonAngles = [160, 130, 90, 50, 20]; // degrees, 0=right, 90=top

  return (
    <>
      {/* Banquette — semicircular crescent (thick C-shape opening downward) */}
      <path
        d={`M ${cx - outerR},${arcY} A ${outerR},${outerR} 0 0 1 ${cx + outerR},${arcY} L ${cx + innerR},${arcY} A ${innerR},${innerR} 0 0 0 ${cx - innerR},${arcY} Z`}
        fill={LEATHER}
        stroke={LEATHER_RIM}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* Cushion highlight — inner upholstery */}
      <path
        d={`M ${cx - outerR + 4},${arcY - 1} A ${outerR - 4},${outerR - 4} 0 0 1 ${cx + outerR - 4},${arcY - 1} L ${cx + innerR + 2},${arcY - 1} A ${innerR + 2},${innerR + 2} 0 0 0 ${cx - innerR - 2},${arcY - 1} Z`}
        fill={LEATHER_PAD}
      />
      {/* Section tint */}
      <path
        d={`M ${cx - outerR + 4},${arcY - 1} A ${outerR - 4},${outerR - 4} 0 0 1 ${cx + outerR - 4},${arcY - 1} L ${cx + innerR + 2},${arcY - 1} A ${innerR + 2},${innerR + 2} 0 0 0 ${cx - innerR - 2},${arcY - 1} Z`}
        fill={`${sectionColor}12`}
      />
      {/* Tufting buttons along banquette arc */}
      {buttonAngles.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const bx = cx + midR * Math.cos(rad);
        const by = arcY - midR * Math.sin(rad);
        return (
          <g key={i}>
            <circle cx={bx} cy={by} r={1.8} fill={LEATHER_RIM} stroke={LEATHER} strokeWidth={0.5} />
            <circle cx={bx} cy={by} r={0.8} fill={BRASS_GLOW} opacity={0.3} />
          </g>
        );
      })}
      {/* Round walnut table — sits in the banquette concavity */}
      <circle cx={cx} cy={62} r={20} fill={WALNUT} stroke={BRASS} strokeWidth={1.5} />
      <circle cx={cx} cy={62} r={16} fill={WALNUT_LITE} opacity={0.3} />
      <circle cx={cx} cy={62} r={19.25} fill="none" stroke={BRASS_GLOW} strokeWidth={0.4} opacity={0.5} />
      {/* Candlelight */}
      <circle cx={cx} cy={62} r={2.5} fill={CANDLE} opacity={0.2} />
      <circle cx={cx} cy={62} r={1.2} fill={CANDLE} opacity={0.45} />
      {/* Open-side chairs (bottom) */}
      {Array.from({ length: Math.min(capacity, 3) }, (_, i) => {
        const seats = Math.min(capacity, 3);
        const x = cx - 20 + (40 / (seats + 1)) * (i + 1);
        return (
          <g key={i}>
            <rect
              x={x - 7} y={88}
              width={14} height={9}
              rx={3.5}
              fill={LEATHER}
              stroke={LEATHER_RIM}
              strokeWidth={1}
            />
            <rect
              x={x - 5} y={89.5}
              width={10} height={6}
              rx={2}
              fill={LEATHER_PAD}
            />
            <rect
              x={x - 5} y={89.5}
              width={10} height={6}
              rx={2}
              fill={`${sectionColor}15`}
            />
          </g>
        );
      })}
    </>
  );
}

/** Bar stool: chrome frame + leather cushion — top-down view */
function BarStoolSVG({ sectionColor }: { sectionColor: string }) {
  return (
    <>
      {/* Outer ring / chrome frame */}
      <circle cx={50} cy={50} r={42} fill="none" stroke={CHROME} strokeWidth={4} />
      <circle cx={50} cy={50} r={42} fill="none" stroke={CHROME_LITE} strokeWidth={1} opacity={0.3} />
      {/* Footrest ring */}
      <circle cx={50} cy={50} r={38} fill="none" stroke={CHROME} strokeWidth={0.8} opacity={0.5} />
      {/* Seat cushion — leather pad */}
      <circle cx={50} cy={50} r={32} fill={LEATHER} stroke={LEATHER_RIM} strokeWidth={2} />
      {/* Cushion highlight */}
      <circle cx={50} cy={50} r={22} fill={LEATHER_PAD} opacity={0.7} />
      {/* Section color tint */}
      <circle cx={50} cy={50} r={22} fill={`${sectionColor}12`} />
      {/* Stitching ring */}
      <circle cx={50} cy={50} r={26} fill="none" stroke={BRASS} strokeWidth={0.6} strokeDasharray="3 2.5" opacity={0.4} />
      {/* Center swivel bolt — brass */}
      <circle cx={50} cy={50} r={5} fill={WALNUT} stroke={BRASS} strokeWidth={1} />
      <circle cx={50} cy={50} r={2} fill={BRASS_GLOW} opacity={0.4} />
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
    case 'half_circle': {
      const hc = Math.min(10, 4 + capacity * 0.6);
      return { width: hc, height: hc };
    }
    case 'pullman':
      return {
        width: Math.min(14, 5 + capacity * 0.8),
        height: Math.min(8, 3.5 + capacity * 0.4),
      };
    case 'bar_seat':
      return { width: 2.5, height: 2.5 };
    default:
      return { width: 6, height: 6 };
  }
}
