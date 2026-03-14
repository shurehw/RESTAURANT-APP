/**
 * KevaOSLogo — Symbol + wordmark system
 *
 * K is a standalone symbol. Wordmark is clean architectural type.
 *
 * Layouts:
 *   stacked:  K symbol centered above "KevaOS" (default for lg/xl)
 *   inline:   K symbol beside "KevaOS" (default for sm/md)
 *   monogram: K symbol only
 */

interface KevaOSLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
  className?: string;
  /** Show only the K symbol without text */
  monogramOnly?: boolean;
  /** Hide "OS" suffix — renders K + "Keva" */
  short?: boolean;
  /** Force layout direction */
  layout?: 'inline' | 'stacked';
}

// Mark is smaller relative to text — supports, doesn't dominate
const sizeConfig = {
  sm: { fontSize: '0.875rem', mark: 12, stackGap: 3, inlineGap: 5, defaultLayout: 'inline' as const },
  md: { fontSize: '1.25rem',  mark: 16, stackGap: 4, inlineGap: 7, defaultLayout: 'inline' as const },
  lg: { fontSize: '1.75rem',  mark: 24, stackGap: 4, inlineGap: 8, defaultLayout: 'stacked' as const },
  xl: { fontSize: '2.5rem',   mark: 32, stackGap: 5, inlineGap: 10, defaultLayout: 'stacked' as const },
} as const;

/**
 * K symbol — refined brand mark.
 *
 * Changes from previous version:
 * - Wider viewBox (52x58) — more balanced negative space
 * - Stem width 12 (was 13) — slightly more elegant
 * - Chevron angles tightened — inner vertices at 30/34 (was 32/32)
 *   creating a small gap at center for visual breathing room
 * - Consistent 2px rx on stem — intentional, not accidental
 */
function KMark({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  const h = Math.round(size * 58 / 52);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 52 58"
      width={size}
      height={h}
      aria-hidden="true"
      className="flex-shrink-0"
      style={{ display: 'block' }}
    >
      {/* Stem — 12px wide, subtle 2px radius */}
      <rect x="0" y="0" width="12" height="58" rx="2" fill={color} />
      {/* Upper chevron — ends at y=30, small gap before lower */}
      <polygon points="12,18 52,0 52,12 12,30" fill={color} />
      {/* Lower chevron — starts at y=34, mirrors upper angle */}
      <polygon points="12,34 52,46 52,58 12,40" fill={color} />
    </svg>
  );
}

export function KevaOSLogo({
  size = 'md',
  variant = 'dark',
  className = '',
  monogramOnly = false,
  short = false,
  layout,
}: KevaOSLogoProps) {
  const config = sizeConfig[size];
  const resolvedLayout = layout || config.defaultLayout;
  const textColor = variant === 'dark' ? '#1C1917' : '#F5F1EB';
  const brassHex = '#D4622B';
  // OS: secondary but not ghosted — readable, just clearly subordinate
  const osColor = variant === 'dark' ? '#78716C' : 'rgba(245,241,235,0.55)';

  if (monogramOnly) {
    return <KMark size={config.mark} color={brassHex} />;
  }

  const wordmark = (
    <>
      <span style={{ color: textColor, fontWeight: 600, letterSpacing: '0.02em' }}>
        Keva
      </span>
      {!short && (
        <span style={{ color: osColor, fontWeight: 400, letterSpacing: '0.04em' }}>
          OS
        </span>
      )}
    </>
  );

  if (resolvedLayout === 'stacked') {
    return (
      <span
        className={`inline-flex flex-col items-center select-none ${className}`}
        aria-label={short ? 'Keva' : 'KevaOS'}
      >
        <KMark size={config.mark} color={brassHex} />
        <span style={{ marginTop: config.stackGap, fontSize: config.fontSize, lineHeight: 1 }}>
          {wordmark}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center leading-none select-none ${className}`}
      aria-label={short ? 'Keva' : 'KevaOS'}
      style={{ fontSize: config.fontSize }}
    >
      <KMark size={config.mark} color={brassHex} />
      <span style={{ marginLeft: config.inlineGap }}>
        {wordmark}
      </span>
    </span>
  );
}

/** @deprecated Use KevaOSLogo instead */
export const OpsOSLogo = KevaOSLogo;

/** Standalone K symbol export */
export { KMark };
