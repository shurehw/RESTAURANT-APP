/**
 * RelayLogo — Relay PWA brand mark
 *
 * Relay is the manager-facing delivery layer of the Keva Loop.
 * Mark is an inductor coil (E2) — classic electromagnetic relay symbol.
 * Four half-circle windings between two terminals, with a switch arm
 * and contact point representing the circuit closing.
 *
 * Layouts:
 *   stacked:  Coil mark centered above "Relay" (default for lg/xl)
 *   inline:   Coil mark beside "Relay" (default for sm/md)
 *   monogram: Coil mark only
 */

interface RelayLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
  className?: string;
  /** Show only the coil symbol without text */
  monogramOnly?: boolean;
  /** Force layout direction */
  layout?: 'inline' | 'stacked';
}

const sizeConfig = {
  sm: { fontSize: '0.875rem', mark: 14, stackGap: 3, inlineGap: 5, defaultLayout: 'inline' as const },
  md: { fontSize: '1.25rem',  mark: 18, stackGap: 4, inlineGap: 7, defaultLayout: 'inline' as const },
  lg: { fontSize: '1.75rem',  mark: 26, stackGap: 4, inlineGap: 8, defaultLayout: 'stacked' as const },
  xl: { fontSize: '2.5rem',   mark: 34, stackGap: 5, inlineGap: 10, defaultLayout: 'stacked' as const },
} as const;

/**
 * Relay inductor coil mark (E2).
 *
 * Classic inductor/solenoid symbol: four half-circle bumps between two
 * terminals, with a switch arm extending to a contact point. Universally
 * recognized as electromagnetic. The engine inside a relay.
 *
 * Keva's signal energizes the coil → magnetic field throws the switch →
 * circuit closes → manager gets the action.
 */
export function RelayMark({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      className="flex-shrink-0"
      style={{ display: 'block' }}
    >
      {/* Top terminal */}
      <circle cx="10" cy="6" r="3.5" fill={color} />
      {/* Wire to coil */}
      <line x1="10" y1="9.5" x2="10" y2="13" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Inductor bumps — four half-circle windings */}
      <path
        d="M10,13 C16,13 16,19 10,19 C16,19 16,25 10,25 C16,25 16,31 10,31 C16,31 16,37 10,37"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Wire from coil */}
      <line x1="10" y1="37" x2="10" y2="38.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Bottom terminal */}
      <circle cx="10" cy="42" r="3.5" fill={color} />
      {/* Switch arm — the relay engaging */}
      <line x1="26" y1="36" x2="36" y2="14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Pivot point (subtle) */}
      <circle cx="26" cy="36" r="2" fill={color} opacity="0.4" />
      {/* Switch contact */}
      <circle cx="37" cy="12" r="3" fill={color} />
    </svg>
  );
}

export function RelayLogo({
  size = 'md',
  variant = 'dark',
  className = '',
  monogramOnly = false,
  layout,
}: RelayLogoProps) {
  const config = sizeConfig[size];
  const resolvedLayout = layout || config.defaultLayout;
  const textColor = variant === 'dark' ? '#1C1917' : '#F5F1EB';
  const brassHex = '#D4622B';

  if (monogramOnly) {
    return <RelayMark size={config.mark} color={brassHex} />;
  }

  const wordmark = (
    <span style={{ color: textColor, fontWeight: 600, letterSpacing: '0.02em' }}>
      Relay
    </span>
  );

  if (resolvedLayout === 'stacked') {
    return (
      <span
        className={`inline-flex flex-col items-center select-none ${className}`}
        aria-label="Relay"
      >
        <RelayMark size={config.mark} color={brassHex} />
        <span style={{ marginTop: config.stackGap, fontSize: config.fontSize, lineHeight: 1 }}>
          {wordmark}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center leading-none select-none ${className}`}
      aria-label="Relay"
      style={{ fontSize: config.fontSize }}
    >
      <RelayMark size={config.mark} color={brassHex} />
      <span style={{ marginLeft: config.inlineGap }}>
        {wordmark}
      </span>
    </span>
  );
}
