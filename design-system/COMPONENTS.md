# OpsOS Component Specifications

Detailed component designs with Tailwind-ready code snippets.

---

## 1. Buttons

### Primary Button (Brass Accent)
```tsx
<button className="
  inline-flex items-center justify-center gap-2
  px-4 py-2
  bg-brass-500 hover:bg-brass-600 active:bg-brass-700
  text-slate-800 font-medium text-sm
  rounded-md
  shadow-sm
  transition-all duration-200
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-500 focus-visible:ring-offset-2
  disabled:opacity-50 disabled:pointer-events-none
">
  Upload Invoice
</button>
```

### Secondary Button (Outline)
```tsx
<button className="
  inline-flex items-center justify-center gap-2
  px-4 py-2
  bg-transparent hover:bg-fog-200 active:bg-fog-300
  text-slate-700 font-medium text-sm
  border border-slate-300 hover:border-slate-400
  rounded-md
  transition-all duration-200
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-500 focus-visible:ring-offset-2
  disabled:opacity-50 disabled:pointer-events-none
">
  Cancel
</button>
```

### Ghost Button
```tsx
<button className="
  inline-flex items-center justify-center gap-2
  px-3 py-1.5
  bg-transparent hover:bg-fog-200 active:bg-fog-300
  text-slate-600 hover:text-slate-800 font-medium text-sm
  rounded-md
  transition-all duration-200
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-500 focus-visible:ring-offset-2
">
  View Details
</button>
```

### Icon Button
```tsx
<button className="
  inline-flex items-center justify-center
  w-9 h-9
  bg-transparent hover:bg-fog-200 active:bg-fog-300
  text-slate-600 hover:text-slate-800
  rounded-md
  transition-all duration-200
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-500 focus-visible:ring-offset-2
">
  <IconComponent className="w-4 h-4" />
</button>
```

---

## 2. Inputs

### Text Input
```tsx
<div className="w-full">
  <label className="block text-sm font-medium text-slate-700 mb-1.5">
    Invoice Number
  </label>
  <input
    type="text"
    className="
      w-full px-3 py-2
      bg-white
      border border-slate-200 hover:border-slate-300
      focus:border-brass-500 focus:ring-2 focus:ring-brass-500/20
      rounded-md
      text-slate-800 text-sm placeholder:text-slate-400
      transition-all duration-200
      disabled:bg-fog-200 disabled:text-slate-500 disabled:cursor-not-allowed
    "
    placeholder="INV-2024-001"
  />
  <p className="mt-1.5 text-xs text-slate-500">Optional helper text</p>
</div>
```

### Text Input (Error State)
```tsx
<div className="w-full">
  <label className="block text-sm font-medium text-slate-700 mb-1.5">
    Email
  </label>
  <input
    type="email"
    className="
      w-full px-3 py-2
      bg-white
      border border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20
      rounded-md
      text-slate-800 text-sm
      transition-all duration-200
    "
  />
  <p className="mt-1.5 text-xs text-red-600">Please enter a valid email</p>
</div>
```

### Select Dropdown
```tsx
<div className="w-full">
  <label className="block text-sm font-medium text-slate-700 mb-1.5">
    Status
  </label>
  <select className="
    w-full px-3 py-2 pr-10
    bg-white
    border border-slate-200 hover:border-slate-300
    focus:border-brass-500 focus:ring-2 focus:ring-brass-500/20
    rounded-md
    text-slate-800 text-sm
    transition-all duration-200
    appearance-none
    cursor-pointer
  ">
    <option>All Invoices</option>
    <option>Draft</option>
    <option>Pending Approval</option>
    <option>Approved</option>
  </select>
</div>
```

### Checkbox
```tsx
<label className="inline-flex items-center gap-2 cursor-pointer group">
  <input
    type="checkbox"
    className="
      w-4 h-4
      border-2 border-slate-300 group-hover:border-slate-400
      rounded-sm
      text-brass-500
      focus:ring-2 focus:ring-brass-500/20 focus:ring-offset-0
      transition-all duration-150
      cursor-pointer
    "
  />
  <span className="text-sm text-slate-700 select-none">
    Include archived items
  </span>
</label>
```

### Switch
```tsx
<label className="inline-flex items-center gap-3 cursor-pointer group">
  <span className="text-sm font-medium text-slate-700">Dark Mode</span>
  <div className="relative">
    <input type="checkbox" className="sr-only peer" />
    <div className="
      w-11 h-6
      bg-slate-200 peer-checked:bg-brass-500
      rounded-full
      peer-focus:ring-2 peer-focus:ring-brass-500/20
      transition-all duration-200
      after:content-['']
      after:absolute after:top-0.5 after:left-0.5
      after:bg-white
      after:rounded-full
      after:h-5 after:w-5
      after:transition-all after:duration-200
      peer-checked:after:translate-x-5
    "></div>
  </div>
</label>
```

---

## 3. Cards

### Default Card
```tsx
<div className="
  bg-white
  border border-slate-200
  rounded-md
  p-6
  shadow-sm hover:shadow-md
  transition-shadow duration-200
">
  <h3 className="text-lg font-semibold text-slate-800 mb-2">
    Card Title
  </h3>
  <p className="text-sm text-slate-600">
    Card content goes here. Use fog-white background with subtle shadows.
  </p>
</div>
```

### Stat Card
```tsx
<div className="
  bg-white
  border border-slate-200
  rounded-md
  p-6
  shadow-sm
">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      Total Invoices
    </span>
    <div className="w-8 h-8 rounded-full bg-brass-100 flex items-center justify-center">
      <IconInvoice className="w-4 h-4 text-brass-600" />
    </div>
  </div>
  <div className="text-3xl font-bold text-slate-800 mb-1">
    247
  </div>
  <div className="flex items-center gap-1 text-xs">
    <span className="text-sage-600">↑ 12%</span>
    <span className="text-slate-500">vs last month</span>
  </div>
</div>
```

### Alert Card
```tsx
<div className="
  bg-brass-50
  border-l-4 border-brass-500
  rounded-md
  p-4
">
  <div className="flex gap-3">
    <div className="flex-shrink-0">
      <IconWarning className="w-5 h-5 text-brass-600" />
    </div>
    <div className="flex-1">
      <h4 className="text-sm font-semibold text-brass-900 mb-1">
        Cost Spike Detected
      </h4>
      <p className="text-sm text-brass-800">
        Organic Chicken Breast price increased 15% this week
      </p>
      <button className="mt-2 text-xs font-medium text-brass-700 hover:text-brass-900">
        View Details →
      </button>
    </div>
  </div>
</div>
```

---

## 4. Tables

### Data Table
```tsx
<div className="overflow-x-auto border border-slate-200 rounded-md">
  <table className="w-full">
    <thead className="bg-fog-200">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Invoice #
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Vendor
        </th>
        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Amount
        </th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Status
        </th>
      </tr>
    </thead>
    <tbody className="bg-white divide-y divide-slate-100">
      <tr className="hover:bg-fog-100 transition-colors duration-150">
        <td className="px-4 py-3 text-sm font-mono text-slate-800">
          INV-2024-001
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">
          Sysco Foods
        </td>
        <td className="px-4 py-3 text-sm font-mono text-right text-slate-800">
          $1,247.50
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-sage-100 text-sage-800">
            Approved
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 5. Badges & Tags

### Status Badge
```tsx
{/* Draft */}
<span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-slate-100 text-slate-700">
  Draft
</span>

{/* Pending */}
<span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-brass-100 text-brass-800">
  Pending
</span>

{/* Approved */}
<span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-sage-100 text-sage-800">
  Approved
</span>

{/* Error */}
<span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-red-100 text-red-800">
  Failed
</span>
```

### Pill Badge (with dot)
```tsx
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
  Active
</span>
```

---

## 6. Navigation

### Sidebar Navigation
```tsx
<aside className="w-64 h-screen bg-white border-r border-slate-200">
  {/* Logo */}
  <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
    <img src="/opsos-logo.png" alt="OpsOS" className="h-8" />
  </div>

  {/* Nav Items */}
  <nav className="p-4 space-y-1">
    <a href="/" className="
      flex items-center gap-3 px-3 py-2
      bg-brass-50 text-brass-900
      rounded-md
      text-sm font-medium
      transition-colors duration-150
    ">
      <IconDashboard className="w-5 h-5" />
      Dashboard
    </a>

    <a href="/invoices" className="
      flex items-center gap-3 px-3 py-2
      text-slate-600 hover:bg-fog-100 hover:text-slate-900
      rounded-md
      text-sm font-medium
      transition-colors duration-150
    ">
      <IconInvoice className="w-5 h-5" />
      Invoices
    </a>
  </nav>
</aside>
```

### Top Bar
```tsx
<header className="h-16 bg-white border-b border-slate-200 px-6">
  <div className="h-full flex items-center justify-between">
    {/* Left: Breadcrumbs */}
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Invoices</span>
      <span className="text-slate-300">/</span>
      <span className="text-slate-800 font-medium">Pending Approval</span>
    </div>

    {/* Right: Actions */}
    <div className="flex items-center gap-3">
      {/* Venue Selector */}
      <select className="px-3 py-1.5 text-sm border border-slate-200 rounded-md">
        <option>Delilah LA</option>
        <option>Nice Guy LA</option>
      </select>

      {/* Alerts */}
      <button className="relative p-2 text-slate-600 hover:text-slate-800 hover:bg-fog-100 rounded-md">
        <IconBell className="w-5 h-5" />
        <span className="absolute top-1 right-1 w-2 h-2 bg-brass-500 rounded-full"></span>
      </button>
    </div>
  </div>
</header>
```

---

## 7. Modals & Drawers

### Modal
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* Overlay */}
  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"></div>

  {/* Modal Container */}
  <div className="
    relative w-full max-w-lg
    bg-white
    rounded-lg
    shadow-xl
    p-6
    animate-in fade-in zoom-in-95 duration-200
  ">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-bold text-slate-800">
        Upload Invoice
      </h2>
      <button className="p-1 text-slate-400 hover:text-slate-600 rounded-md">
        <IconX className="w-5 h-5" />
      </button>
    </div>

    {/* Content */}
    <div className="space-y-4">
      {/* Modal content */}
    </div>

    {/* Footer */}
    <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-slate-200">
      <button className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-fog-100 rounded-md">
        Cancel
      </button>
      <button className="px-4 py-2 text-sm font-medium bg-brass-500 hover:bg-brass-600 text-slate-800 rounded-md">
        Upload
      </button>
    </div>
  </div>
</div>
```

### Drawer (Slide from Right)
```tsx
<div className="fixed inset-0 z-50">
  {/* Overlay */}
  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"></div>

  {/* Drawer */}
  <div className="
    absolute top-0 right-0 bottom-0
    w-full max-w-md
    bg-white
    shadow-xl
    p-6
    overflow-y-auto
    animate-in slide-in-from-right duration-250
  ">
    <h2 className="text-xl font-bold text-slate-800 mb-6">
      Invoice Details
    </h2>
    {/* Drawer content */}
  </div>
</div>
```

---

## 8. Form Elements

### Search Input
```tsx
<div className="relative">
  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
    <IconSearch className="w-4 h-4" />
  </div>
  <input
    type="search"
    placeholder="Search invoices..."
    className="
      w-full pl-10 pr-4 py-2
      bg-white
      border border-slate-200
      focus:border-brass-500 focus:ring-2 focus:ring-brass-500/20
      rounded-md
      text-sm text-slate-800 placeholder:text-slate-400
      transition-all duration-200
    "
  />
</div>
```

### Date Picker Input
```tsx
<div className="relative">
  <input
    type="date"
    className="
      w-full px-3 py-2 pr-10
      bg-white
      border border-slate-200
      focus:border-brass-500 focus:ring-2 focus:ring-brass-500/20
      rounded-md
      text-sm text-slate-800
      transition-all duration-200
    "
  />
  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
    <IconCalendar className="w-4 h-4" />
  </div>
</div>
```

---

## 9. Loading States

### Spinner
```tsx
<div className="inline-flex items-center gap-2 text-sm text-slate-600">
  <svg className="animate-spin h-4 w-4 text-brass-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
  <span>Loading...</span>
</div>
```

### Skeleton
```tsx
<div className="space-y-3">
  <div className="h-4 bg-slate-200 rounded animate-pulse"></div>
  <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4"></div>
  <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2"></div>
</div>
```

---

## 10. Empty States

### Empty Table
```tsx
<div className="flex flex-col items-center justify-center py-12">
  <div className="w-16 h-16 rounded-full bg-fog-200 flex items-center justify-center mb-4">
    <IconInbox className="w-8 h-8 text-slate-400" />
  </div>
  <h3 className="text-base font-semibold text-slate-800 mb-1">
    No invoices found
  </h3>
  <p className="text-sm text-slate-500 mb-4">
    Get started by uploading your first invoice
  </p>
  <button className="px-4 py-2 bg-brass-500 hover:bg-brass-600 text-slate-800 text-sm font-medium rounded-md">
    Upload Invoice
  </button>
</div>
```

---

**All components designed for shadcn/ui + Tailwind + Next.js**
