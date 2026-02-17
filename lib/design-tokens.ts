/**
 * OpsOS Design Tokens
 * Visual Identity: Premium Tech Aesthetic
 * Character: Clean, technical, purposeful
 */

export const designTokens = {
  // Colors - Premium tech palette
  colors: {
    // Brand
    primary: '#0A0A0A',
    secondary: '#64748B',

    // OpsOS Signature Accent
    ledgerGold: '#FF5A1F',
    ledgerGoldDark: '#EA4C0C',

    // Backgrounds
    paperWhite: '#FFFFFF',
    paperGray: '#FAFAFA',

    // Functional
    success: '#10B981',
    warning: '#F59E0B',
    critical: '#DC2626',
    info: '#3B82F6',

    // Neutrals (cool)
    gray50: '#FAFAFA',
    gray100: '#F5F5F5',
    gray200: '#E5E5E5',
    gray300: '#D4D4D4',
    gray400: '#A3A3A3',
    gray500: '#737373',
    gray600: '#525252',
    gray700: '#404040',
    gray800: '#262626',
    gray900: '#171717',
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
    insetAccent: 'inset 0 0 0 1px rgba(255, 90, 31, 0.2)',
    subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },

  // Borders
  borders: {
    width: {
      default: '1px',
      thick: '2px',
    },
    color: {
      default: '#E5E5E5',
      accent: '#FF5A1F',
      emphasis: '#0A0A0A',
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
