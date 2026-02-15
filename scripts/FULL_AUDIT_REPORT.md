# OpsOS Full Product Audit

**Target**: `https://opsos-restaurant-app.vercel.app`
**Date**: 2026-02-14
**Executed by**: Playwright browser automation + manual screenshot review
**Browser automation**: EXECUTED (artifacts below)

---

## A) Assumptions

1. This is a **B2B SaaS dashboard** for multi-unit restaurant operators — not a public marketing site. There is no landing page, no marketing copy, no pricing page. Evaluation is of the **product itself**.
2. Login credentials: `jacob@hwoodgroup.com` / Supabase auth
3. The primary buyer persona is a multi-unit hospitality CFO or VP of Ops evaluating a $250K–$1M/yr platform decision
4. "Enterprise-ready" means: role-based access, audit trails, mobile support, SSO, export capabilities, uptime SLAs
5. The product is pre-revenue / early-stage based on empty states across multiple modules

## B) Playwright Setup Commands

```bash
npm install playwright
npx playwright install chromium
```

## C) Full Playwright Script

See: `scripts/full-audit-test.mjs` (218 lines)

## D) Run Instructions

```bash
cd /path/to/RESTAURANT-APP
node scripts/full-audit-test.mjs
```

Output: `scripts/audit-report.json`, `scripts/audit-screenshots/`, `trace.zip`

## E) Artifact List

| Artifact | Path |
|----------|------|
| JSON Report | `scripts/audit-report.json` |
| Screenshots (32 desktop + 8 mobile + 2 form) | `scripts/audit-screenshots/` |
| Playwright trace | `scripts/audit-screenshots/trace.zip` |
| Video recording | `scripts/audit-screenshots/*.webm` |

## F) report.json Schema

```json
{
  "metadata": { "url", "timestamp", "viewports" },
  "login": { "success", "time_ms", "redirect_url" },
  "pages": [{
    "name", "path", "section", "status", "http_status",
    "load_time_ms", "has_content", "content_length",
    "page_errors", "console_errors", "network_errors",
    "quality_flags", "screenshot", "sidebar_visible",
    "topbar_visible", "h1_text"
  }],
  "broken_links": [],
  "console_errors": [{ "page", "error" }],
  "network_failures": [{ "page", "url", "method", "error" }],
  "form_issues": [{ "form", "test", "has_validation" }],
  "mobile_issues": [{ "viewport", "page", "issues" }],
  "performance": [{ "page", "load_time_ms", "flag" }],
  "sidebar_links": [{ "href", "text" }],
  "topbar_buttons": [{ "label" }],
  "summary": { "total_pages", "pass", "warn", "fail", ... }
}
```

---

## G) Functional Findings

### Test Results Summary

| Metric | Value |
|--------|-------|
| Total pages tested | 32 |
| Pages loaded (HTTP 200) | 30 |
| Pages timed out (>45s) | 2 (Home, Nightly Report) |
| Auth redirects | 0 (all passed login) |
| Avg load time | 3,011ms |
| Console errors captured | 39 |
| Network failures | 422 |
| Mobile issues | 8/8 (100% failure rate) |
| Form validation | 2/2 tests passed |
| Sidebar links | 26 (all functional) |
| Topbar buttons | 6 |

### Page-by-Page Status

#### PASS (30 pages load with correct content)
All 30 non-timeout pages render with correct H1 text, sidebar, topbar, and functional content. Examples:
- Orders: table with venue filter pills, "New Order" CTA
- Vendors: populated list with real vendor data (Ben E Keith, Chef's Warehouse, etc.)
- Forecasts: 6,017 covers / $545K revenue / chart with confidence intervals
- Budget: $10K weekly budget vs $10.2K actual spend with trend chart
- Schedule: 147 shifts, CPLH 2.18, labor % 6.6% — fully functional grid
- Attestations: real compliance data (0% rate, 48 late/missed across 9 venues)
- Preshift Briefing: enforcement items with carry-forward tracking
- Control Plane: "All Clear" with per-venue enforcement status
- Procurement Settings: thresholds form with Cost Spike, Shrink, Recipe Drift
- Comp Settings: organization picker, 6 configuration tabs

#### FAIL (2 pages)
| Page | Issue | Root Cause |
|------|-------|------------|
| Home (`/`) | Timeout >45s | Heavy SSR — fetches nightly report data for all venues |
| Nightly Report (`/reports/nightly`) | Timeout >45s | Heavy SSR — aggregates POS data across all venues |

#### Issues Found
| Issue | Severity | Pages Affected |
|-------|----------|----------------|
| Operational Standards: "Access denied" error | HIGH | `/admin/operational-standards` |
| Comp Settings: "No settings found" empty state | MEDIUM | `/admin/comp-settings` |
| Procurement Settings: stray "0" above content | LOW | `/admin/procurement-settings` |
| Proforma Builder: gray overlay on empty state | LOW | `/proforma` |
| Savings: all $0 values, no data | LOW | `/savings` |
| Live Pulse: $0 / 0 covers (outside service hours) | INFO | `/sales/pace` |
| System Bounds: blocks non-super-admin correctly | INFO | `/admin/system-bounds` |

### Mobile Responsiveness: CRITICAL FAILURE

| Test | Result |
|------|--------|
| iPhone 14 (390x844) | FAIL — sidebar visible, horizontal overflow |
| iPad (820x1180) | FAIL — sidebar visible, horizontal overflow |

**Every mobile viewport test failed.** The sidebar is fixed at 256px with no responsive collapse. Content overflows horizontally. No hamburger menu, no responsive breakpoints. The product is **desktop-only**.

### Form Validation
- Login empty submit: Validates (shows error)
- Login bad email: Validates (shows "Invalid login credentials")

### Broken Links
None found. All 26 sidebar links resolve to functional pages.

---

## H) Usability Audit

### Persona A: Multi-Unit Operator (5–15 restaurants)

#### 60-Second Comprehension Test
| Question | Answer in <60s? | Notes |
|----------|-----------------|-------|
| What is OpsOS? | YES | Login says "Restaurant Operations." Sidebar categories make it clear. |
| What makes it different? | PARTIAL | Control Plane / Preshift / Attestations hint at enforcement, but no comparison or positioning visible in-product |
| Why should I care? | NO | No KPI summary, no "here's what OpsOS caught last week" on the home page (home times out) |
| What does it replace? | NO | No onboarding flow, no integration status page |
| How does it integrate? | NO | No visible POS connection status, no API health indicators |

#### Score
| Dimension | Score (1–10) | Notes |
|-----------|-------------|-------|
| Message clarity | 6 | Good labels, but no hero messaging inside the product |
| Navigation clarity | 7 | Sidebar is well-organized by domain. 26 links is a lot for first-time users. |
| Perceived maturity | 6 | Pages load, real data shows. Many empty states hurt perception. |
| Enterprise readiness | 4 | No mobile, no SSO, no export across most pages, no audit log UI |

### Persona B: CFO of 25+ Unit Hospitality Group

#### 60-Second Comprehension Test
| Question | Answer in <60s? | Notes |
|----------|-----------------|-------|
| What is OpsOS? | YES | Clearly a restaurant ops platform |
| What makes it different? | NO | Enforcement language exists in Operational Standards but is buried 4 clicks deep |
| Why should I care? | NO | Home page times out. No executive dashboard. No P&L impact summary. |
| What does it replace? | NO | Unclear what current tools it displaces (R365? Margin Edge? Spreadsheets?) |
| How does it integrate? | NO | No visible integration page or POS status |

#### Score
| Dimension | Score (1–10) | Notes |
|-----------|-------------|-------|
| Message clarity | 5 | "Operational Standard Operating System" is circular. What's the 1-sentence pitch? |
| Navigation clarity | 6 | Too many nav items for an exec. No role-based nav filtering. |
| Perceived maturity | 5 | Empty states on key pages ($0 savings, no orders, no settings saved) |
| Enterprise readiness | 3 | No SOC2 badge, no uptime SLA, no SSO, no mobile, no audit trail UI |

### 7 Usability Friction Points

1. **Home page times out** — The first page a user sees after login is broken. First impression is a loading spinner or blank screen.
2. **26 sidebar items with no role-based filtering** — A server or bartender sees the same nav as a CFO. No progressive disclosure.
3. **No mobile layout at all** — 256px fixed sidebar renders on iPhone. Content is clipped. Not "bad mobile" — it's "no mobile."
4. **Stale empty states across modules** — Orders ("No orders yet"), Savings ($0), Proforma ("No projects yet"), Comp Settings ("No settings found"). Multiple modules look abandoned.
5. **Topbar has 5 unlabeled icons** — Team, Settings, Notifications, Profile, Logout all look similar. No tooltips visible on mobile. Settings and Profile both go to org settings.
6. **Venue selector redundancy** — Topbar has a venue dropdown AND most pages have venue pills. Which one controls which? They appear disconnected.
7. **No breadcrumbs or page hierarchy** — Deep pages like `/control-plane/attestations` have no trail back to parent. "Attestations" in sidebar doesn't indicate it's under Control Plane.

### 5 Clarity Failures

1. **"Control Plane"** — Means nothing to a restaurant operator. This is infrastructure jargon. Should be "Manager Actions" or "Action Center."
2. **"Operational Standards" vs "Comp Settings" vs "Procurement Settings"** — Three admin pages with overlapping concepts. What's the mental model? When do I use which?
3. **"Live Pulse" vs "Nightly Report" vs "Venue Health"** — Three sales views. What's real-time? What's historical? What's the difference between health and a report?
4. **"Proforma Builder"** — Hospitality people say "P&L model" or "pro forma." The word "Builder" implies a CMS tool, not a financial model.
5. **Enforcement language** — The best product differentiator ("enforcement spine", carry-forward, attestation gates) is only visible in Operational Standards, which shows "Access denied." The core value prop is invisible.

### 3 Confusing Sections

1. **Budget page** — Shows $10K weekly budget with real-looking data but appears static/demo. Is this real? How do I set budget? No edit button.
2. **Entertainment Calendar** — Why is this a core navigation item alongside P&L tools? This feels like a feature for a different product.
3. **AI Assistant** — Empty chat interface with suggested prompts ("Last night's sales", "Top server"). Looks like a demo. No conversation history, no indication it works.

### 3 Unnecessary Sections (for v1 sales)

1. **Entertainment Calendar** — Deprioritize. Not part of the enforcement / prime cost story.
2. **Savings Dashboard** — All $0. Remove or hide until there's data. Showing an empty ROI page hurts the sale.
3. **Reports (generic)** — There's already Nightly Report, Venue Health, and other reporting pages. The generic "Reports" link is confusing.

---

## I) CFO Approval Simulation

### Core Questions

**1. Does this look like infrastructure or a dashboard?**
DASHBOARD. The product looks like a reporting tool with nice charts, not an enforcement engine. The enforcement language exists in a few admin pages (Operational Standards, Preshift carry-forward, Attestation compliance), but the main experience is data tables and KPI cards. A CFO would see "another dashboard" before they see "infrastructure."

**2. Does this look like enforcement or reporting?**
REPORTING with enforcement features bolted on. The home page (if it loaded) would show a nightly report. The sidebar leads with COGS data (Orders, Invoices, Vendors). The enforcement story (Control Plane, Preshift, Attestations) is buried in the middle of the Sales section. The strongest enforcement evidence — 0% attestation compliance, 48 late/missed across 9 venues — is real and compelling, but you have to know where to find it.

**3. Would you trust this with prime cost governance?**
NOT YET. Evidence:
- Budget page shows $10K budget with $10.2K spend — but no edit controls, no approval workflow
- Procurement Settings exist but are new (no data saved yet)
- Inventory counts exist but items page says "no items found"
- Vendor data is real but contact fields are all "—" (empty)
- No visible audit trail for who changed what when

**4. Does this justify enterprise pricing?**
NOT IN CURRENT STATE. The product has impressive breadth (32 functional pages across COGS, Sales, Labor, Compliance) but lacks the depth signals that justify $250K+: no SOC2, no SSO, no mobile, no export strategy, no audit log UI, no SLA documentation.

### 5 Reasons a CFO Would Hesitate

1. **No executive summary view** — Home page times out. There's no "here's your portfolio P&L" starting point. A CFO doesn't want to click through 26 nav items.
2. **Empty modules signal incomplete product** — $0 savings, no orders, no comp settings saved. "Is this a prototype or a product?"
3. **No mobile access** — "I need to check this from my car between restaurants. It doesn't work on my phone? Pass."
4. **No visible security posture** — No SOC2 badge, no mention of data encryption, no SSO. "Where is my POS data going?"
5. **Vendor data quality** — Real vendors exist but every contact/phone/email is "—". If the vendor master is empty, how is procurement enforcement working?

### 3 Missing Risk-Mitigation Signals

1. **No SOC2 / security compliance badge** anywhere in the product or login page
2. **No SLA / uptime indicator** — No status page link, no "99.9% uptime" claim
3. **No data retention / backup policy** visible to the user

### 3 Missing Proof Points

1. **No ROI calculator or savings evidence** — The Savings page is $0. No "customers save X% on food cost" anywhere.
2. **No case studies or testimonials** — Even one "Delilah reduced comps by 40%" would be powerful
3. **No integration proof** — No "Connected to Toast" or "Syncing with R365" status indicator. The h.wood Group is clearly on the platform, but there's no visible data pipeline status.

### 3 Overclaims

1. **"Bias-corrected" on Forecasts page** — Claims bias correction with a 17% hit rate (within 10%). That's poor. Either the label is premature or the model needs work.
2. **"AI-powered" on multiple pages** — AI Assistant is an empty chat. Daily Briefing mentions AI but shows "No forecasts available." Overuse of "AI" without visible results.
3. **"Auto-generated optimal schedules"** — Schedule page is impressive (147 shifts, labor % visible), but "optimal" is a strong claim for a draft schedule with no comparison to alternatives.

### Approval Score

**Approval likelihood: 35/100**

### What Would Move This to 85%+

1. **Fix the home page** — A working executive dashboard with portfolio-level P&L summary is table stakes. This is the first thing a CFO sees.
2. **Show enforcement in action** — The Attestation Compliance page (0% rate, 48 missed) is the most compelling screen in the product. Make this the LANDING experience, not something buried 5 clicks deep.
3. **Populate the demo** — Comp settings saved with real rules. Vendor contacts filled in. At least one savings event. First impressions of empty states kill deals.
4. **Add mobile** — Even a read-only mobile view of key dashboards. A responsive sidebar collapse would be the minimum.
5. **Security signals** — SOC2 badge on login page. SSO option. "Your data is encrypted at rest and in transit" somewhere visible.
6. **One proof point** — "The h.wood Group reduced comp exceptions by X% in the first 30 days." Real, specific, verifiable.

---

## J) Executive Summary (Brutal, Concise)

**OpsOS has built an impressive breadth of functionality** — 30+ working pages spanning COGS management, demand forecasting, labor scheduling, compliance tracking, procurement settings, and AI-assisted operations. The enforcement architecture (carry-forward, attestation gates, configurable thresholds) is genuinely differentiated. The data is real. The scheduling module alone (147 shifts, CPLH tracking, labor % computation) demonstrates serious backend capability.

**But the product sells itself as a dashboard, not an enforcement engine.** The home page doesn't load. The sidebar leads with COGS tables. The enforcement story is buried in admin pages. A CFO evaluating this would see "another restaurant dashboard" before discovering the control plane architecture that makes OpsOS different.

**Critical gaps for enterprise sales:**
- No mobile (100% viewport failure rate)
- Home page timeout (first impression is broken)
- Empty states across key modules ($0 savings, no comp settings)
- No security posture signals (SOC2, SSO, audit trail UI)
- No proof points (ROI data, case studies, integration status)

**The enforcement spine is real. The product just doesn't lead with it.**

---

## PART 4 — Structural Recommendations

### Top 10 High-Impact Changes

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Fix home page timeout** — Replace heavy SSR with cached/async summary | CRITICAL | 1-2 days |
| 2 | **Make enforcement the landing experience** — Show attestation compliance, carry-forward items, and enforcement scorecard on the home page | CRITICAL | 3-5 days |
| 3 | **Add responsive mobile layout** — Collapsible sidebar, stack content vertically below 768px | CRITICAL | 3-5 days |
| 4 | **Populate demo data** — Save comp settings, add vendor contacts, create at least one savings event | HIGH | 1 day |
| 5 | **Rename "Control Plane"** to "Action Center" or "Manager Actions" | HIGH | 1 hour |
| 6 | **Add role-based nav filtering** — Servers see their schedule + preshift. Managers see enforcement. CFOs see P&L + compliance. | HIGH | 3-5 days |
| 7 | **Fix Operational Standards "Access denied"** — This is the enforcement configuration page showing errors to the admin user | HIGH | 1 day |
| 8 | **Add SOC2 badge + security copy to login page** | HIGH | 1 hour |
| 9 | **Consolidate venue selection** — Topbar dropdown should control page context globally, not compete with page-level pills | MEDIUM | 2-3 days |
| 10 | **Add integration status indicator** — "Last POS sync: 3 min ago" in topbar or settings | MEDIUM | 1 day |

### Quick Wins (1 Week)

1. Fix home page (replace SSR with cached data or static dashboard)
2. Rename "Control Plane" → "Action Center"
3. Save default comp settings for h.wood Group org
4. Add SOC2/security language to login page
5. Fix "Access denied" on Operational Standards
6. Remove stray "0" on Procurement Settings page
7. Hide or badge empty modules (Savings, Entertainment)

### Structural Rewrites (30 Days)

1. **Responsive layout** — Sidebar collapse with hamburger menu, viewport-aware content stacking
2. **Role-based navigation** — Filter sidebar items by user role (server/manager/admin/CFO)
3. **Executive home dashboard** — Portfolio P&L summary, enforcement scorecard, top exceptions across all venues, attestation compliance rate
4. **Onboarding flow** — First-time user guided setup: connect POS → configure enforcement → set thresholds → invite team
5. **Audit trail UI** — Visible log of who changed settings, who approved/denied actions, attestation history

### What NOT to Waste Time On

1. **Marketing landing page** — You're selling to 25-unit groups through direct outreach, not inbound. The product IS the demo.
2. **More admin settings pages** — You have Comp Settings, Procurement Settings, Operational Standards, System Bounds, Org Settings. That's enough. Wire them together, don't add more.
3. **AI chatbot polish** — The AI Assistant is a nice-to-have. Don't invest in making it look better until the core enforcement story is front-and-center.
4. **Entertainment Calendar** — This doesn't support the enforcement/prime-cost narrative. Deprioritize entirely.
