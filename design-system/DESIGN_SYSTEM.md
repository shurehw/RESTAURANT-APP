# OpsOS Design System
**Run on clarity.**

A modern, minimal UI system inspired by vintage ledgers and built for hospitality operations.

---

## 🎨 Visual Identity

### Brand Essence
- **Tone**: Clean, data-driven, calm — like Notion × Stripe × an old accounting ledger
- **Ratio**: 80% minimalist neutral / 20% warm brass and sage accents
- **Motion**: Subtle micro-interactions (150-250ms, no bounce)

### Logo
- **Mark**: Concentric-ring "O" icon representing data cycles
- **Wordmark**: "OpsOS" in slate gray
- **Tagline**: "Run on clarity." (secondary: "Every plate. Every penny. Every process.")

---

## 🎨 Color System

### Primary Palette

| Name | HEX | HSL | Usage |
|------|-----|-----|-------|
| **Slate Gray** | `#1B1D1F` | `210° 8% 11%` | Primary text, headings, icons |
| **Fog White** | `#F5F5F4` | `60° 9% 96%` | Background, neutral surfaces |
| **Brass** | `#C4A46B` | `39° 45% 59%` | Accent, buttons, highlights |
| **Sage Green** | `#92A69C` | `152° 13% 61%` | Secondary accent, success, calming elements |

### Semantic Colors

| Purpose | Color | HEX |
|---------|-------|-----|
| Success | Sage | `#92A69C` |
| Warning | Brass | `#C4A46B` |
| Error | Muted Red | `#C76864` |
| Info | Mid Slate | `#7B7F82` |

### Color Usage Guidelines

**Text Hierarchy:**
- Primary text: `slate-800`
- Secondary text: `slate-500`
- Disabled text: `slate-300`
- Links: `brass-600` (hover: `brass-700`)

**Backgrounds:**
- Page: `fog-100`
- Card: `fog-50` (white)
- Hover: `fog-200`
- Active: `fog-300`

**Borders:**
- Default: `slate-200`
- Focus: `brass-500`
- Error: `error`

---

## ✍️ Typography

### Font Stack

```css
--font-heading: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'IBM Plex Mono', 'SF Mono', 'Monaco', 'Courier New', monospace;
```

### Type Scale

| Level | Size | Line Height | Weight | Letter Spacing | Usage |
|-------|------|-------------|--------|----------------|-------|
| **H1** | 40px | 1.2 | 700 | -0.02em | Page titles |
| **H2** | 32px | 1.25 | 700 | -0.01em | Section headers |
| **H3** | 24px | 1.3 | 600 | -0.01em | Card titles |
| **H4** | 20px | 1.4 | 600 | 0 | Subsection headers |
| **H5** | 18px | 1.4 | 600 | 0 | Group labels |
| **H6** | 16px | 1.5 | 600 | 0 | Small headers |
| **Body Large** | 18px | 1.6 | 400 | 0 | Intro text |
| **Body** | 16px | 1.6 | 400 | 0 | Default text |
| **Body Small** | 14px | 1.5 | 400 | 0 | Supporting text |
| **Caption** | 12px | 1.4 | 500 | 0.01em | Labels, metadata |
| **Overline** | 12px | 1.2 | 600 | 0.08em | All-caps labels |
| **Mono** | 14px | 1.5 | 400 | 0 | Data tables, code |

### Typography Guidelines

- **Headings**: Use slate-800, bold weight
- **Body**: Use slate-600 for better readability
- **Data tables**: Use mono font for alignment
- **Numbers**: Tabular figures for tables (`font-variant-numeric: tabular-nums`)

---

## 📐 Spacing & Layout

### Spacing Scale
```
1  = 0.25rem = 4px
2  = 0.5rem  = 8px
3  = 0.75rem = 12px
4  = 1rem    = 16px
6  = 1.5rem  = 24px
8  = 2rem    = 32px
12 = 3rem    = 48px
16 = 4rem    = 64px
```

### Component Spacing
- **Micro**: 4-8px (button padding, icon gaps)
- **Small**: 12-16px (card padding, form fields)
- **Medium**: 24-32px (section spacing, modals)
- **Large**: 48-64px (page margins, hero sections)

### Layout Dimensions
- **Sidebar**: 256px (16rem) | Collapsed: 64px (4rem)
- **Topbar**: 64px (4rem)
- **Max container**: 1280px (80rem)
- **Page padding**: 32px (2rem)

---

## 🔲 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `none` | 0 | Tables, data grids |
| `sm` | 4px | Tags, badges |
| `DEFAULT` | 6px | Buttons, inputs |
| `md` | 8px | Cards |
| `lg` | 12px | Modals, drawers |
| `xl` | 16px | Large cards |
| `full` | 9999px | Pills, avatars |

---

## ✨ Shadows

```css
/* Elevation levels */
--shadow-sm: 0 1px 2px 0 rgba(27, 29, 31, 0.05);
--shadow-md: 0 4px 6px -1px rgba(27, 29, 31, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(27, 29, 31, 0.1);
--shadow-xl: 0 20px 25px -5px rgba(27, 29, 31, 0.1);
--shadow-inner: inset 0 2px 4px 0 rgba(27, 29, 31, 0.05);
```

### Shadow Usage
- **Cards**: `shadow-sm` (resting), `shadow-md` (hover)
- **Modals/Drawers**: `shadow-lg`
- **Dropdowns**: `shadow-xl`
- **Inputs (focus)**: `shadow-sm` + ring

---

## 🎬 Motion & Transitions

### Duration
- **Fast**: 150ms (hover, active states)
- **Base**: 200ms (default transitions)
- **Slow**: 250ms (modals, drawers)

### Easing
```css
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
```

### Animation Principles
- **Subtle**: No bounce or elastic effects
- **Fade in/out**: Opacity transitions
- **Slide**: Translate with fade (modals, drawers)
- **Scale**: Minimal (0.95 → 1.0 for popovers)

---

## 🧩 Component Library

### Buttons

**Variants:**
1. **Primary** (Brass)
   - Background: `brass-500`
   - Hover: `brass-600`
   - Text: `slate-800`

2. **Secondary** (Outline)
   - Border: `slate-300`
   - Hover: `fog-200`
   - Text: `slate-700`

3. **Ghost**
   - Transparent
   - Hover: `fog-200`
   - Text: `slate-600`

**Sizes:**
- Small: `px-3 py-1.5 text-sm`
- Medium: `px-4 py-2 text-base`
- Large: `px-6 py-3 text-lg`

**States:**
- Focus: Ring `brass-500` 2px
- Disabled: Opacity 50%, cursor not-allowed
- Loading: Spinner + text fade

### Inputs

**Default:**
- Border: `slate-200`
- Focus: Border `brass-500` + ring
- Error: Border `error` + helper text
- Disabled: Background `fog-200`

**Sizes:**
- Small: Height 32px
- Medium: Height 40px
- Large: Height 48px

### Tables

**Structure:**
- Header: Background `fog-200`, text `slate-700`, bold
- Row: Border-bottom `slate-100`
- Hover: Background `fog-100`
- Zebra stripes: Optional `fog-50` alternate rows

**Cell Padding:**
- Compact: `py-2 px-3`
- Default: `py-3 px-4`
- Comfortable: `py-4 px-6`

### Cards

**Default:**
- Background: White (`fog-50`)
- Border: `slate-200` 1px
- Radius: `md` (8px)
- Shadow: `shadow-sm`
- Padding: `p-6`

**Hover State:**
- Shadow: `shadow-md`
- Transition: 200ms

### Tags/Badges

**Variants:**
- **Status**: Small pill with colored background
  - Draft: `slate-200` bg, `slate-700` text
  - Pending: `brass-200` bg, `brass-800` text
  - Approved: `sage-200` bg, `sage-800` text
  - Error: `error-light` bg, `error-dark` text

**Size:**
- Default: `px-2 py-0.5 text-xs rounded-sm`

### Modals/Drawers

**Modal:**
- Overlay: Black 50% opacity
- Container: White, `shadow-xl`, `rounded-lg`
- Max width: 600px
- Padding: `p-6`
- Animation: Fade + scale (95% → 100%)

**Drawer:**
- Slide from right
- Width: 480px
- Shadow: `shadow-xl`
- Animation: Translate-x + fade

---

## 📱 Dashboard Layouts

### /invoices
- **Top bar**: Title + Upload button + Export button
- **Filter bar**: Status dropdown + Venue dropdown
- **Table**: Scrollable, sortable columns
- **Pagination**: Bottom right

### /inventory
- **Split view**: Location selector (left) + Count sheet table (right)
- **Variance highlighting**: Red/green delta indicators
- **Action bar**: Save draft, Submit count buttons

### /recipes
- **Split pane**:
  - Left: Ingredient list (editable table)
  - Right: Live cost card (auto-calculated)
- **Sticky header**: Recipe name + yield info

### /budget
- **Chart**: Declining budget line chart (brass line)
- **Summary card**: Remaining balance (large number, sage or brass)
- **Filter**: Venue + Department + Week selector

### /alerts
- **Feed layout**: Vertical stack of alert cards
- **Card structure**:
  - Icon (brass warning, sage success)
  - Title + timestamp
  - Details + action button

---

## ♿ Accessibility

### Contrast Ratios
- **Text**: Minimum 4.5:1 (WCAG AA)
- **Large text (18px+)**: Minimum 3:1
- **UI components**: Minimum 3:1

### Focus States
- **Visible ring**: 2px `brass-500` with 2px offset
- **Never remove**: `:focus-visible` for keyboard navigation

### Screen Readers
- All interactive elements have labels
- Icons include `aria-label` or `sr-only` text
- Table headers use `<th>` with `scope`

---

## 🚀 Implementation Notes

### Font Loading
```typescript
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const ibmPlexMono = localFont({
  src: './fonts/IBMPlexMono-Regular.woff2',
  variable: '--font-ibm-plex-mono',
});
```

### Tailwind Config
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        opsos: {
          slate: {...},
          fog: {...},
          brass: {...},
          sage: {...},
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
        mono: ['var(--font-ibm-plex-mono)'],
      },
    },
  },
};
```

### CSS Variables
```css
:root {
  --opsos-slate: #1B1D1F;
  --opsos-fog: #F5F5F4;
  --opsos-brass: #C4A46B;
  --opsos-sage: #92A69C;

  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 📦 Component Export Format

All components follow shadcn/ui conventions:
- TypeScript with proper types
- Tailwind for styling
- Radix UI for primitives
- Class variance authority (CVA) for variants

---

**OpsOS Design System v1.0**
*Run on clarity.*
