/**
 * OpsOS Design Tokens
 * Visual Identity: Operational Command OS
 * Character: Industrial, ledger-like, purposeful
 */

export const designTokens = {
  // Colors - Keep brand colors, add operational accents
  colors: {
    // Brand (unchanged)
    primary: '#000000',
    secondary: '#6B7280',

    // OpsOS Signature Accent
    ledgerGold: '#D4C1A0',
    ledgerGoldDark: '#B8A485',

    // Backgrounds
    paperWhite: '#FAF9F6',
    paperGray: '#F5F4F1',

    // Functional
    success: '#10B981',
    warning: '#F59E0B',
    critical: '#EF4444',
    info: '#3B82F6',

    // Neutrals (warmer)
    gray50: '#FAFAF8',
    gray100: '#F5F4F1',
    gray200: '#EAEAE5',
    gray300: '#D4D3CE',
    gray400: '#A8A7A0',
    gray500: '#6B6A63',
    gray600: '#4A4944',
    gray700: '#333330',
    gray800: '#1F1F1D',
    gray900: '#0A0A09',
  },

  // Typography - Industrial, command-driven
  typography: {
    // Font stack: IBM Plex Sans for operational feel
    fontFamily: {
      sans: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"IBM Plex Mono", Consolas, Monaco, monospace',
    },

    // Scale (more deliberate jumps)
    fontSize: {
      xs: '0.6875rem',    // 11px - micro labels
      sm: '0.8125rem',    // 13px - secondary
      base: '0.9375rem',  // 15px - body
      lg: '1.125rem',     // 18px - emphasis
      xl: '1.5rem',       // 24px - section headers
      '2xl': '2rem',      // 32px - page headers
      '3xl': '2.5rem',    // 40px - dashboard metrics
    },

    // Weight (purposeful hierarchy)
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },

    // Line height (tighter for command density)
    lineHeight: {
      tight: '1.25',
      base: '1.5',
      relaxed: '1.75',
    },

    // Letter spacing (slightly wider for legibility)
    letterSpacing: {
      tight: '-0.01em',
      normal: '0',
      wide: '0.025em',
    },
  },

  // Spacing - More deliberate rhythm
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '3rem',    // 48px
    '3xl': '4rem',    // 64px
  },

  // Border Radius - Sharper, more technical
  borderRadius: {
    none: '0',
    sm: '2px',
    base: '4px',
    lg: '6px',
    full: '9999px',
  },

  // Shadows - Flat, inset borders instead
  shadows: {
    none: 'none',
    inset: 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
    insetLedger: 'inset 0 0 0 1px rgba(212, 193, 160, 0.3)',
    subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },

  // Borders
  borders: {
    width: {
      default: '1px',
      thick: '2px',
    },
    color: {
      default: '#EAEAE5',
      ledger: '#D4C1A0',
      emphasis: '#333330',
    },
  },

  // Transitions - Snap-on, instant feel
  transitions: {
    fast: '80ms linear',
    base: '100ms linear',
    slow: '200ms ease-in',
  },

  // Grid - 2px micro grid texture
  grid: {
    size: '2px',
    color: 'rgba(212, 193, 160, 0.1)',
  },

  // Card padding differentiation
  card: {
    primary: '1.5rem',    // 24px
    secondary: '1rem',    // 16px
    compact: '0.75rem',   // 12px
  },

  // Z-index layers
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    drawer: 1030,
    modal: 1040,
    popover: 1050,
    toast: 1060,
  },

  // Icon stroke width
  icon: {
    strokeWidth: '1.25px',
  },
} as const;

export type DesignTokens = typeof designTokens;

// CSS Custom Properties generator
export function generateCSSVariables() {
  return `
    /* OpsOS Design Tokens */
    :root {
      /* Colors */
      --color-primary: ${designTokens.colors.primary};
      --color-secondary: ${designTokens.colors.secondary};
      --color-ledger-gold: ${designTokens.colors.ledgerGold};
      --color-ledger-gold-dark: ${designTokens.colors.ledgerGoldDark};
      --color-paper-white: ${designTokens.colors.paperWhite};
      --color-paper-gray: ${designTokens.colors.paperGray};

      /* Typography */
      --font-sans: ${designTokens.typography.fontFamily.sans};
      --font-mono: ${designTokens.typography.fontFamily.mono};

      /* Spacing */
      --spacing-xs: ${designTokens.spacing.xs};
      --spacing-sm: ${designTokens.spacing.sm};
      --spacing-md: ${designTokens.spacing.md};
      --spacing-lg: ${designTokens.spacing.lg};
      --spacing-xl: ${designTokens.spacing.xl};

      /* Border Radius */
      --radius-sm: ${designTokens.borderRadius.sm};
      --radius-base: ${designTokens.borderRadius.base};
      --radius-lg: ${designTokens.borderRadius.lg};

      /* Transitions */
      --transition-fast: ${designTokens.transitions.fast};
      --transition-base: ${designTokens.transitions.base};
      --transition-slow: ${designTokens.transitions.slow};

      /* Grid */
      --grid-size: ${designTokens.grid.size};
      --grid-color: ${designTokens.grid.color};

      /* Icon */
      --icon-stroke-width: ${designTokens.icon.strokeWidth};
    }
  `;
}
