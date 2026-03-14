/**
 * KevaOS Design Tokens
 * Visual Identity: Warm Hospitality Aesthetic
 * Character: Earthy, purposeful, premium
 */

export const designTokens = {
  // Colors — Warm hospitality palette (matches deck)
  colors: {
    // Brand
    primary: '#1C1917',
    secondary: '#8B7E6F',
    olive: '#5C6B4F',

    // KevaOS Signature Accent
    ledgerGold: '#D4622B',
    ledgerGoldDark: '#7C2D12',

    // Backgrounds
    paperWhite: '#FFFEFB',
    paperGray: '#FAF8F5',

    // Functional
    success: '#5C6B4F',
    warning: '#D4622B',
    critical: '#DC2626',
    info: '#8B7E6F',

    // Neutrals (warm stone scale)
    gray50: '#FAF8F5',
    gray100: '#F5F1EB',
    gray200: '#E8E2DA',
    gray300: '#D5CCC1',
    gray400: '#B5ADA1',
    gray500: '#8B7E6F',
    gray600: '#6B6156',
    gray700: '#44403C',
    gray800: '#292524',
    gray900: '#1C1917',
  },

  // Typography - Clean tech fonts
  typography: {
    fontFamily: {
      sans: '"Space Grotesk", system-ui, sans-serif',
      mono: '"JetBrains Mono", monospace',
    },

    // Scale
    fontSize: {
      xs: '0.6875rem',    // 11px - micro labels
      sm: '0.8125rem',    // 13px - secondary
      base: '0.9375rem',  // 15px - body
      lg: '1.125rem',     // 18px - emphasis
      xl: '1.5rem',       // 24px - section headers
      '2xl': '2rem',      // 32px - page headers
      '3xl': '2.5rem',    // 40px - dashboard metrics
    },

    // Weight
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },

    // Line height
    lineHeight: {
      tight: '1.25',
      base: '1.5',
      relaxed: '1.75',
    },

    // Letter spacing
    letterSpacing: {
      tight: '-0.01em',
      normal: '0',
      wide: '0.025em',
    },
  },

  // Spacing
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '3rem',    // 48px
    '3xl': '4rem',    // 64px
  },

  // Border Radius - Clean, slightly rounded
  borderRadius: {
    none: '0',
    sm: '4px',
    base: '6px',
    lg: '8px',
    full: '9999px',
  },

  // Shadows
  shadows: {
    none: 'none',
    inset: 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
    insetAccent: 'inset 0 0 0 1px rgba(212, 98, 43, 0.2)',
    subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },

  // Borders
  borders: {
    width: {
      default: '1px',
      thick: '2px',
    },
    color: {
      default: '#E8E2DA',
      accent: '#D4622B',
      emphasis: '#1C1917',
    },
  },

  // Transitions - Snap-on, instant feel
  transitions: {
    fast: '80ms linear',
    base: '100ms linear',
    slow: '200ms ease-in',
  },

  // Grid
  grid: {
    size: '1px',
    color: 'rgba(0, 0, 0, 0.03)',
  },

  // Card padding
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
    strokeWidth: '1.5px',
  },
} as const;

export type DesignTokens = typeof designTokens;

// CSS Custom Properties generator
export function generateCSSVariables() {
  return `
    /* KevaOS Design Tokens */
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
