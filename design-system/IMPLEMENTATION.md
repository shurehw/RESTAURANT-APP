# OpsOS Design System - Implementation Guide

Complete hand-off documentation for engineering implementation.

---

## 📦 Installation & Setup

### 1. Required Packages

```bash
# Already installed
npm install tailwindcss postcss autoprefixer
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install lucide-react
npm install recharts
npm install tailwindcss-animate
```

### 2. Font Setup

**fonts/index.ts**
```typescript
import { Inter } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// If using IBM Plex Mono locally:
import localFont from 'next/font/local';

export const ibmPlexMono = localFont({
  src: [
    {
      path: './IBMPlexMono-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './IBMPlexMono-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-ibm-plex-mono',
});
```

**app/layout.tsx**
```typescript
import { inter } from '@/fonts';

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

### 3. Tailwind Configuration

✅ Already updated in `tailwind.config.ts`

Includes:
- OpsOS brand colors (slate, fog, brass, sage)
- Typography scale (h1-h6)
- Custom transitions
- Font family variables

### 4. Global CSS

✅ Already updated in `app/globals.css`

Color variables now match OpsOS palette:
- `--opsos-slate: #1B1D1F`
- `--opsos-fog: #F5F5F4`
- `--opsos-brass: #C4A46B`
- `--opsos-sage: #92A69C`

---

## 🎨 Using the Design System

### Color Usage

```tsx
// Primary text
<h1 className="text-opsos-slate-800">Heading</h1>

// Background
<div className="bg-opsos-fog-100">Content</div>

// Accent button
<button className="bg-opsos-brass-500 hover:bg-opsos-brass-600">
  Click me
</button>

// Success state
<span className="text-opsos-sage-600">Approved</span>
```

### Typography

```tsx
// Heading with proper scale
<h1 className="text-h1 font-bold text-opsos-slate-800">
  Page Title
</h1>

// Body text
<p className="text-base text-opsos-slate-600 leading-relaxed">
  Body content with proper line height
</p>

// Monospace for data
<span className="font-mono text-sm tabular-nums">
  $1,234.56
</span>
```

### Spacing

```tsx
// Component padding (medium)
<div className="p-6">Card content</div>

// Section spacing
<section className="space-y-8">
  <div>Section 1</div>
  <div>Section 2</div>
</section>

// Page container
<div className="max-w-7xl mx-auto px-8 py-12">
  Page content
</div>
```

---

## 🧩 Component Patterns

### Button Component

```tsx
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opsos-brass-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-opsos-brass-500 text-opsos-slate-800 hover:bg-opsos-brass-600 shadow-sm',
        secondary: 'bg-transparent border border-opsos-slate-300 text-opsos-slate-700 hover:bg-opsos-fog-200',
        ghost: 'bg-transparent text-opsos-slate-600 hover:bg-opsos-fog-200 hover:text-opsos-slate-800',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
```

Usage:
```tsx
<Button variant="primary">Upload Invoice</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" size="sm">Details</Button>
```

### Card Component

```tsx
// components/ui/card.tsx
export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'bg-white border border-opsos-slate-200 rounded-md p-6 shadow-sm hover:shadow-md transition-shadow duration-200',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 mb-4', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn(
        'text-lg font-semibold leading-none tracking-tight text-opsos-slate-800',
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p
      className={cn('text-sm text-opsos-slate-600', className)}
      {...props}
    />
  );
}
```

Usage:
```tsx
<Card>
  <CardHeader>
    <CardTitle>Total Invoices</CardTitle>
    <CardDescription>Last 30 days</CardDescription>
  </CardHeader>
  <div className="text-3xl font-bold text-opsos-slate-800">247</div>
</Card>
```

### Badge Component

```tsx
// components/ui/badge.tsx
const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-opsos-slate-100 text-opsos-slate-700',
        pending: 'bg-opsos-brass-100 text-opsos-brass-800',
        approved: 'bg-opsos-sage-100 text-opsos-sage-800',
        error: 'bg-red-100 text-red-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export function Badge({ className, variant, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
```

Usage:
```tsx
<Badge variant="default">Draft</Badge>
<Badge variant="pending">Pending</Badge>
<Badge variant="approved">Approved</Badge>
<Badge variant="error">Failed</Badge>
```

---

## 📊 Dashboard Layout Pattern

### Standard Page Structure

```tsx
// app/(dashboard)/[page]/page.tsx
export default function PageName() {
  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-h1 font-bold text-opsos-slate-800 mb-2">
            Page Title
          </h1>
          <p className="text-opsos-slate-600">
            Supporting description
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="primary">Primary Action</Button>
        </div>
      </div>

      {/* Filters (if applicable) */}
      <div className="flex gap-4 mb-6">
        <Select />
        <Select />
      </div>

      {/* Main Content */}
      <Card>
        {/* Table, chart, or other content */}
      </Card>
    </div>
  );
}
```

### Sidebar Navigation

```tsx
// components/layout/sidebar.tsx
export function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-white border-r border-opsos-slate-200">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-opsos-slate-200">
        <img src="/opsos-logo.png" alt="OpsOS" className="h-8" />
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        <NavLink href="/" icon={<DashboardIcon />} active>
          Dashboard
        </NavLink>
        <NavLink href="/invoices" icon={<InvoiceIcon />}>
          Invoices
        </NavLink>
        {/* ... more links */}
      </nav>
    </aside>
  );
}

function NavLink({ href, icon, children, active = false }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150',
        active
          ? 'bg-opsos-brass-50 text-opsos-brass-900'
          : 'text-opsos-slate-600 hover:bg-opsos-fog-100 hover:text-opsos-slate-900'
      )}
    >
      <span className="w-5 h-5">{icon}</span>
      {children}
    </Link>
  );
}
```

---

## ♿ Accessibility Checklist

### Color Contrast

✅ All text meets WCAG AA standards:
- `opsos-slate-800` on white: 13.4:1 ✓
- `opsos-slate-600` on white: 8.1:1 ✓
- `opsos-brass-800` on `brass-100`: 7.2:1 ✓
- `opsos-sage-800` on `sage-100`: 8.5:1 ✓

### Focus States

```tsx
// Always include visible focus rings
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opsos-brass-500 focus-visible:ring-offset-2"
```

### Screen Reader Support

```tsx
// Buttons with icons only
<button aria-label="Close dialog">
  <XIcon className="w-4 h-4" />
  <span className="sr-only">Close</span>
</button>

// Status badges
<Badge aria-label="Invoice status: Approved">
  Approved
</Badge>

// Data tables
<table>
  <thead>
    <tr>
      <th scope="col">Invoice #</th>
      <th scope="col">Amount</th>
    </tr>
  </thead>
</table>
```

---

## 🎬 Animation Guidelines

### Transition Durations

```tsx
// Hover states (fast)
className="transition-colors duration-fast" // 150ms

// Standard interactions (base)
className="transition-all duration-base" // 200ms

// Modals/drawers (slow)
className="transition-all duration-slow" // 250ms
```

### Easing Function

```tsx
// Use custom easing for all animations
className="transition-all duration-200 ease-opsos"
// cubic-bezier(0.4, 0, 0.2, 1)
```

### Modal Animations

```tsx
// Fade + scale in
<div className="animate-in fade-in zoom-in-95 duration-200">
  Modal content
</div>

// Slide from right
<div className="animate-in slide-in-from-right duration-250">
  Drawer content
</div>
```

---

## 📐 Responsive Design

### Breakpoints

Use Tailwind's default breakpoints:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

### Mobile Patterns

```tsx
// Stack on mobile, row on desktop
<div className="flex flex-col md:flex-row gap-4">
  <div>Column 1</div>
  <div>Column 2</div>
</div>

// Hide sidebar on mobile
<aside className="hidden lg:block w-64">
  Sidebar
</aside>

// Mobile-first padding
<div className="px-4 md:px-8 lg:px-12">
  Content
</div>
```

---

## 🚨 Common Pitfalls

### ❌ Don't Do This

```tsx
// Using arbitrary colors
<div className="bg-blue-500"> // Wrong!

// Inconsistent spacing
<div className="p-7"> // Not in design system!

// Missing transitions
<button className="hover:bg-gray-200"> // No transition!

// Inaccessible focus
<button className="outline-none"> // No focus indicator!
```

### ✅ Do This Instead

```tsx
// Use OpsOS palette
<div className="bg-opsos-brass-500">

// Use design system spacing
<div className="p-6">

// Include smooth transitions
<button className="hover:bg-opsos-fog-200 transition-colors duration-fast">

// Always show focus
<button className="focus-visible:ring-2 focus-visible:ring-opsos-brass-500">
```

---

## 📚 Resources

- **Design Tokens**: `design-system/tokens.json`
- **Component Specs**: `design-system/COMPONENTS.md`
- **Full Design System**: `design-system/DESIGN_SYSTEM.md`
- **Logo Assets**: `public/opsos-logo.png`
- **Color Palette**: Slate (#1B1D1F), Fog (#F5F5F4), Brass (#C4A46B), Sage (#92A69C)

---

## 🤝 Engineering Hand-off Notes

### What's Ready
✅ Complete design token system
✅ Tailwind configuration with OpsOS colors
✅ Base component specifications
✅ Accessibility guidelines
✅ Animation standards
✅ Typography scale
✅ Logo and branding assets

### Implementation Priority
1. **Core components** (Button, Input, Card, Badge)
2. **Layout components** (Sidebar, Topbar, Container)
3. **Data display** (Table, EmptyState, LoadingState)
4. **Overlays** (Modal, Drawer, Dropdown)
5. **Form elements** (Select, Checkbox, Switch, DatePicker)

### Testing Requirements
- [ ] Color contrast meets WCAG AA
- [ ] Keyboard navigation works throughout
- [ ] Focus indicators visible on all interactive elements
- [ ] Responsive behavior tested on mobile/tablet/desktop
- [ ] Hover/active states smooth at 200ms
- [ ] Dark mode support (optional, but plan for it)

---

**OpsOS Design System v1.0**
*Run on clarity.*
