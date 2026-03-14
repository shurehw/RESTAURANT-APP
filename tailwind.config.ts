/**
 * KevaOS Tailwind Configuration
 * Warm hospitality design system — espresso, ivory, copper, taupe
 */

import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // KevaOS Brand Palette — Warm Hospitality (matches deck)
        keva: {
          slate: {
            "DEFAULT": "#1C1917",
            "50": "#FAF8F5",
            "100": "#F5F1EB",
            "200": "#E8E2DA",
            "300": "#D5CCC1",
            "400": "#B5ADA1",
            "500": "#8B7E6F",
            "600": "#6B6156",
            "700": "#44403C",
            "800": "#292524",
            "900": "#1C1917"
          },
          fog: {
            "DEFAULT": "#FAF8F5",
            "50": "#FFFEFB",
            "100": "#FAF8F5",
            "200": "#F5F1EB",
            "300": "#E8E2DA",
            "400": "#D5CCC1"
          },
          brass: {
            "DEFAULT": "#D4622B",
            "50": "#FDF5EF",
            "100": "#FCEADB",
            "200": "#F8D0B3",
            "300": "#F0AD7D",
            "400": "#E8844A",
            "500": "#D4622B",
            "600": "#B84D1F",
            "700": "#993D18",
            "800": "#7C2D12",
            "900": "#5C1F0A"
          },
          sage: {
            "DEFAULT": "#8B7E6F",
            "50": "#FAF8F5",
            "100": "#F5F1EB",
            "200": "#E8E2DA",
            "300": "#D5CCC1",
            "400": "#B5ADA1",
            "500": "#8B7E6F",
            "600": "#6B6156",
            "700": "#44403C",
            "800": "#292524",
            "900": "#1C1917"
          },
          olive: {
            "DEFAULT": "#5C6B4F",
            "50": "#F4F6F2",
            "100": "#E5EAE0",
            "200": "#C9D3C0",
            "300": "#A8B89A",
            "400": "#849A73",
            "500": "#5C6B4F",
            "600": "#4A5640",
            "700": "#394132",
            "800": "#2A3025",
            "900": "#1C201A"
          },
          error: {
            "DEFAULT": "#DC2626",
            "50": "#FEF2F2",
            "100": "#FEE2E2",
            "200": "#FECACA",
            "300": "#FCA5A5",
            "500": "#DC2626",
            "700": "#B91C1C",
            "900": "#7F1D1D",
          },
        },

        // Simple KevaOS tokens (for backwards compatibility)
        slate: "var(--keva-slate)",
        fog: "var(--keva-fog)",
        brass: "var(--keva-brass)",
        sage: "var(--keva-sage)",
        olive: "var(--keva-olive)",
        error: "var(--keva-error)",

        // Shadcn theme mappings
        background: "var(--keva-fog)",
        foreground: "var(--keva-slate)",

        card: {
          DEFAULT: "var(--keva-fog)",
          foreground: "var(--keva-slate)",
        },

        popover: {
          DEFAULT: "var(--keva-fog)",
          foreground: "var(--keva-slate)",
        },

        primary: {
          DEFAULT: "var(--keva-slate)",
          foreground: "var(--keva-fog)",
        },

        secondary: {
          DEFAULT: "var(--keva-brass)",
          foreground: "var(--keva-slate)",
        },

        muted: {
          DEFAULT: "hsl(from var(--keva-slate) h s 95%)",
          foreground: "hsl(from var(--keva-slate) h s 45%)",
        },

        accent: {
          DEFAULT: "var(--keva-brass)",
          foreground: "var(--keva-slate)",
        },

        destructive: {
          DEFAULT: "var(--keva-error)",
          foreground: "var(--keva-fog)",
        },

        border: "hsl(from var(--keva-slate) h s 90%)",
        input: "hsl(from var(--keva-slate) h s 85%)",
        ring: "var(--keva-brass)",

        success: "var(--keva-olive)",

        chart: {
          "1": "var(--keva-brass)",
          "2": "var(--keva-sage)",
          "3": "var(--keva-slate)",
          "4": "var(--keva-olive)",
          "5": "hsl(from var(--keva-brass) h s 70%)",
        },
      },

      fontFamily: {
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        heading: ["var(--font-space-grotesk)", "sans-serif"],
      },

      fontSize: {
        // KevaOS Typography Scale
        "display": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "h1": ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "h2": ["2rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" }],
        "h3": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "h4": ["1.25rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" }],
        "h5": ["1.125rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" }],
        "h6": ["1rem", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body": ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        "overline": ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.08em", fontWeight: "600" }],
      },

      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },

      boxShadow: {
        sm: "0 1px 2px 0 rgba(28, 25, 23, 0.05)",
        DEFAULT: "0 1px 3px 0 rgba(28, 25, 23, 0.1), 0 1px 2px -1px rgba(28, 25, 23, 0.1)",
        md: "0 4px 6px -1px rgba(28, 25, 23, 0.1), 0 2px 4px -2px rgba(28, 25, 23, 0.1)",
        lg: "0 10px 15px -3px rgba(28, 25, 23, 0.1), 0 4px 6px -4px rgba(28, 25, 23, 0.1)",
        xl: "0 20px 25px -5px rgba(28, 25, 23, 0.1), 0 8px 10px -6px rgba(28, 25, 23, 0.1)",
        inner: "inset 0 2px 4px 0 rgba(28, 25, 23, 0.05)",

        // KevaOS accent shadows (warm copper glow)
        "brass-sm": "0 1px 2px 0 rgba(212, 98, 43, 0.15)",
        "brass-md": "0 4px 6px -1px rgba(212, 98, 43, 0.2)",
      },

      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "128": "32rem",
      },

      transitionDuration: {
        "fast": "150ms",
        "base": "200ms",
        "slow": "250ms",
      },

      transitionTimingFunction: {
        "keva": "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "zoom-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },

      animation: {
        "fade-in": "fade-in 200ms ease-keva",
        "slide-in-right": "slide-in-right 250ms ease-keva",
        "slide-in-left": "slide-in-left 250ms ease-keva",
        "zoom-in": "zoom-in 200ms ease-keva",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
} satisfies Config;
