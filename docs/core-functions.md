# KevaOS — Core Functions Reference

> **KevaOS** — an agentic enforcement engine for multi-venue restaurant operations. It doesn't just detect and report — it schedules, reserves, and procures within fixed operational rails.
> *The rules are always on. The rails are fixed. Calibration is allowed. Escape is not.*

---

## How It Works

KevaOS enforces four operational domains through a shared spine:

```
Detect variance → Flag exception → Require attestation → Extract signal → Track follow-through
```

But KevaOS doesn't just observe and report — it **agentically acts** across three domains:

| Domain | What the engine does autonomously | Human role |
|--------|----------------------------------|------------|
| **Revenue** | Adjusts demand posture, modifies access rules, accepts/denies reservations, shifts pacing per slot | Override, VIP exceptions, attestation |
| **Labor** | Generates demand-driven schedules, assigns shifts by position × CPLH targets, flags overstaffing | Approve/edit schedule, explain variance |
| **Procurement** | Forecasts ingredient demand from covers, generates purchase orders, flags cost anomalies | Approve POs, count inventory, explain waste |

The automation level is configurable per venue: `advisory` (recommend only) → `semi_auto` (act on low-risk, recommend on high-risk) → `autonomous` (act within bounds, log everything). Hard constraints are never overridden — VIPs are never auto-denied, stress ceilings trigger human review, confidence thresholds gate autonomous decisions.

Every domain feeds the same attestation and signalling layer. The four domains are:

| Domain | What it enforces | Input side | Output side |
|--------|-----------------|------------|-------------|
| **Revenue** | Covers, pace, yield, comps | Reservations, demand posture | Sales pace, comp detection |
| **Labor** | Staffing, productivity, cost | Demand-driven scheduling | CPLH tracking, variance |
| **Procurement** | COGS, waste, vendor cost | Recipes, ingredient forecast | Inventory counts, PO generation |
| **Operations** | Service quality, greeting, turns | Floor plan, host stand | Camera detection, turn analytics |

---

# Part 1 — The Spine

## Attestation & Signalling

The shared enforcement layer that all four domains feed into.

**Attestation types:** Revenue (daily closing), Labor (FOH/BOH variance), Comp resolution, Culinary feedback, Guest module.

**Workflow:**
```
Exception Detected → Attestation Created → Manager Reviews
→ AI Narrative Generated → Coaching Queue → Follow-up Tracking → Signal Outcome
```

**Preshift Briefing** (`/preshift`) — Carried-forward manager actions from prior shifts, new escalations with priority ranking, quick-acknowledge workflow.

**Control Plane** (`/control-plane`) — Manager action tracking, commitment management, follow-through rates, discipline scoring.

**Key files:** `lib/attestation/control-plane.ts`, `lib/attestation/triggers.ts`, `lib/enforcement/carry-forward.ts`, `lib/enforcement/escalation.ts`, `lib/enforcement/state-machine.ts`, `components/attestation/`

### Reports & AI Narratives

The signal output — executive visibility across all four domains.

| Report | Route | Cadence |
|--------|-------|---------|
| Nightly Report | `/reports/nightly` | Daily (emailed via Resend) |
| Weekly Agenda | `/reports/weekly` | Weekly executive overview |
| Health Report | `/reports/health` | Multi-venue portfolio health |
| Variance Report | `/reports/variance` | COGS variance analysis |
| P&L | `/reports` | Financial performance |

**AI narrators:** `lib/ai/closing-narrator.ts` (nightly), `lib/ai/weekly-narrator.ts` (weekly), `lib/ai/signal-extractor.ts` (issue categorization).

### Operational Standards & Configuration

Multi-layer enforcement configuration: **Fixed → Company → Venue**.

- `/admin/operational-standards` — Enforcement thresholds
- `/admin/comp-settings` — Comp policy
- `/admin/system-bounds` — Global enforcement bounds
- `/admin/procurement-settings` — Supplier scorecards
- `/admin/manager-intelligence` — Internal signals (not visible to managers)

All settings use **P0 versioned pattern**: insert-only, version chain, full audit trail, point-in-time queries.

**Key files:** `lib/database/operational-standards.ts`, `lib/database/system-bounds.ts`, `lib/database/procurement-settings.ts`

---

# Part 2 — Revenue Domain

Enforcement loop: **Forecast → Reservations (control input) → Sales Pace (monitor output) → Comp Detection → Attestation**

**Agentic behavior:** The yield engine autonomously adjusts demand posture, modifies access rules on AI-managed slots, and evaluates inbound reservations with accept/deny/alternate decisions — all without human intervention. Pacing recommendations are generated nightly and applied to access rules when approved (or auto-applied in `autonomous` mode). Every decision is logged with confidence score, reasoning, and outcome tracking.

## POS Data Ingestion

Captures real-time sales performance during service hours from multiple POS systems.

| Source | Integration | Tables |
|--------|------------|--------|
| Upserve (most LA venues) | TipSee sync | `tipsee_checks`, `tipsee_check_items` |
| Simphony (Dallas) | TipSee + BI | `tipsee_simphony_sales` |
| Toast (new venues) | Direct API | `toast_*` |

**What it produces:** Sales snapshots every 5 minutes, comp exception detection, beverage % tracking.

**Key files:** `lib/database/tipsee.ts`, `lib/etl/tipsee-sync.ts`, `lib/integrations/toast.ts`, `app/api/sales/poll/route.ts`

## Reservation Engine & Yield Management

Controls the revenue input side — managing covers, pacing, and table inventory to hit pace targets before gaps happen.

### Native Reservations
- 8-state lifecycle: `pending → confirmed → arrived → seated → completed` (+ `waitlisted`, `no_show`, `cancelled`)
- Multi-channel intake: direct, SevenRooms, Resy, OpenTable, phone, walk-in, concierge, agent
- State machine enforcement with optimistic concurrency
- Full event log (every transition with actor type: user/system/ai/sync)

### Access Rules & Pacing
- Per-venue/shift guardrails: `max_covers_per_interval` per 30-min slot
- Party size constraints, turn time expectations, channel allocation
- Custom pacing overrides by time slot
- Service charges, deposits, and spend minimums
- AI-managed flag for autonomous adjustment eligibility

### Yield Management (6 Forecast Models)
1. **Demand Forecast** — Per-slot expected requests/covers, adjusted by pickup pace
2. **Duration Prediction** — Cohort-based (party_size × section × DOW × shift), p25/p50/p75/p90
3. **Show/No-Show/Cancel Probability** — Per-guest risk from channel, lead time, history
4. **Spend Prediction** — Expected revenue per party + bev % estimation
5. **Walk-in Pressure** — Per-slot expected walk-ins with conversion scoring (0–100)
6. **Stress Forecast** — FOH congestion, kitchen risk, arrival burst prediction

### Demand Posture
Five states: `aggressive` | `open` | `balanced` | `protected` | `highly_protected`

Per-slot actions: `release` | `hold` | `protect` | `close` — computed from demand strength, stress, walk-in pressure, current bookings, and capacity.

### Request Evaluation
Every inbound reservation scored on accept value vs. hold value:
- **Accept value** = expected revenue + second-turn value + relationship value + pacing fit − no-show cost − future opportunity cost
- **Hold value** = future booking value + walk-in reserve + VIP demand − underfill cost
- Decision: `accept` | `offer_alternate` | `waitlist` | `deny` — with AI-generated reasoning

### Guest Profiles & VIP Tiers
- Aggregated visit history by email/phone identity
- Tracks: visit count, no-show rate, cancel rate, avg spend, LTV
- VIP tiers: standard / silver / gold / platinum
- Hard constraint: VIP never auto-denied

### SevenRooms Sync
- Cron every 5 min during service → syncs today + tomorrow
- Status mapping, time parsing, dedup by `(venue_id, channel, external_id)`

### Configuration (per venue)
- `automation_level`: `advisory` | `semi_auto` | `autonomous`
- Aggressiveness ceiling, max overbooking %, walk-in reserve %
- Stress thresholds, turn buffer, large-top protection
- VIP table IDs and protection level

**Key files:** `lib/database/reservations.ts`, `lib/ai/rez-yield-policy.ts`, `lib/ai/rez-yield-forecaster.ts`, `lib/database/rez-yield-metrics.ts`, `lib/database/rez-yield-config.ts`, `lib/database/demand-calendar.ts`, `lib/etl/reservation-sync.ts`, `lib/ai/rez-agent-policy.ts`

## Sales Pace & Forecasting

Real-time monitoring of revenue output against forecast.

- **Live Pulse** (`/sales/pace`) — 5-min auto-refresh, pace vs. forecast with status indicators (on_pace / warning / critical)
- **Demand Curves** — Historical demand profiles fitted for projection
- **AI Recommendations** — Velocity adjustment suggestions during service

**Key files:** `lib/database/sales-pace.ts`, `lib/ai/pacing-optimizer.ts`, `lib/etl/demand-curves.ts`, `components/pulse/`

## Comp Policy Enforcement

Prevents unauthorized comps; requires explanation for deviations; tracks root causes.

**Flow:** Comp Detected → Validate vs. Approved Reasons → Flag if High-Value/Budget-Exceeding → AI Review → Require Attestation

**Defaults (h.wood Group SOPs):**
- High-value threshold: $200 | Server max: $50
- Daily budget warning: 2% of revenue | Critical: 3%
- 19 approved comp reasons

**Settings use P0 versioned pattern** — immutable rows, version chain, full audit trail.

**Key files:** `lib/database/comp-settings.ts`, `lib/ai/comp-reviewer.ts`, `lib/database/enforcement.ts`, `components/admin/CompSettingsManager.tsx`

---

# Part 3 — Labor Domain

Enforcement loop: **Demand Forecast → Schedule Generation → Live Staffing → Efficiency Tracking → Variance Detection → Attestation**

**Agentic behavior:** The scheduler generates complete shift assignments from demand forecasts — position by position, factoring CPLH targets, peak distribution, and min/max shift constraints. Managers review and adjust; they don't build from scratch. Variance between scheduled and actual staffing is auto-detected and routed to attestation.

## Labor Management & Scheduling

Engine-generated schedules based on demand; tracks labor productivity.

| Feature | Route | Purpose |
|---------|-------|---------|
| AI Briefing | `/labor/briefing` | Morning staffing summary |
| Schedule Editor | `/labor/schedule` | Visual drag-and-drop calendar |
| Schedule Compare | `/labor/schedule/compare` | Forecast vs. actual |
| Efficiency | `/labor/efficiency` | Covers per labor hour (CPLH) |
| Margin Improvement | `/labor/margin-improvement` | Cost optimization scenarios |

**Key metrics:** CPLH by position (13–28), peak % (22% of daily covers), FOH min shift 4–6h, BOH min shift 4–5h.

**Key files:** `lib/scheduler-lite.ts`, `lib/ai/forecast-explainer.ts`, `lib/database/labor-exceptions.ts`, `components/labor/`

---

# Part 4 — Procurement Domain

Enforcement loop: **Recipes (theoretical cost) → Inventory (actual count) → Variance Detection → COGS Enforcement → Corrective Purchasing → Attestation**

**Agentic behavior:** The engine forecasts ingredient demand from cover forecasts × recipe yields, generates purchase orders automatically when stock projections hit reorder points, and flags cost anomalies (vendor price spikes, waste outliers, COGS drift). POs are auto-generated and queued for approval; waste and variance exceptions route to attestation.

## Products & Recipes

The cost baseline — what things *should* cost.

- **Products** (`/products`) — Menu items, bulk import, competitor price scraping
- **Recipes** (`/recipes`) — Versioned recipe management with sub-recipes and ingredient tracking
- Ingredient demand forecasting from cover forecasts

**Key files:** `lib/database/recipe-versioning.ts`, `lib/database/ingredient-forecast.ts`, `lib/items/inference.ts`

## Inventory & COGS

The cost reality — what things *actually* cost.

- Physical count management with approval workflow
- Waste tracking with reason codes
- GL actual COGS calculation (via R365 integration)
- Variance detection: theoretical (recipe × covers) vs. actual (counts + invoices)

**Key files:** `lib/database/inventory-exceptions.ts`, `lib/database/cogs-enforcement.ts`, `lib/database/waste-tracking.ts`, `lib/database/gl-actuals.ts`

## Purchasing & Invoices

The corrective action — closing the cost loop.

- **Orders** (`/orders`) — Purchase order lifecycle
- **Invoices** (`/invoices`) — Invoice review, GL line-item matching, cost sync
- Auto PO generation based on forecasted demand + current inventory
- Supplier scorecards

**Key files:** `lib/database/auto-po-generator.ts`, `lib/invoices/cost-sync.ts`, `lib/integrations/r365.ts`

---

# Part 5 — Operations Domain

Enforcement loop: **Floor Plan → Host Stand Execution → Camera Detection → Turn Analytics → Greeting Compliance → Attestation**

## Floor Management & Host Stand

The physical execution surface where reservations and labor decisions become reality.

**Floor Plan Editor** (`/floor-plan`) — Drag-and-drop table placement, section assignment, table combos, staff assignments.

**Host Stand** (`/host-stand`) — Live floor view, reservation integration, walk-in seating, turnover analytics. Runs on a separate auth flow for host-only access.

**Camera Integration** — UniFi Protect snapshots → Claude Vision analysis with custom polygon zones → greeting compliance tracking.

**Key files:** `lib/floor-management/table-state-machine.ts`, `lib/cv/greeting-detector.ts`, `lib/integrations/unifi-protect.ts`, `components/floor-plan/`, `components/host-stand/`

---

# Part 6 — Cross-Cutting

### Automation Tiers

All agentic behavior follows the same tiered model:

| Tier | Mode | Engine behavior | Human role |
|------|------|----------------|------------|
| 0 | `advisory` | Recommend only — all decisions surfaced for review | Approve or dismiss every action |
| 1 | `semi_auto` | Auto-execute low-risk decisions, recommend high-risk | Review flagged items, override when needed |
| 2 | `autonomous` | Act within bounds, log everything, escalate on hard constraints | Monitor signals, handle escalations |

Hard constraints are never bypassed regardless of tier: VIP never auto-denied, stress ceilings trigger human review, confidence < 40% blocks autonomous action.

### AI Assistant (Command)
Natural language interface across all four domains. Portfolio data queries, action initiation.

**Key files:** `lib/chatbot/executor.ts`, `lib/chatbot/tools.ts`, `lib/chatbot/queries.ts`, `components/chatbot/ChatInterface.tsx`

### Authentication & Multi-Tenancy
- Supabase Auth → `resolveContext()` → `{ orgId, venueId, userId }`
- RLS on every table, scoped to `org_id`
- Platform admins bypass via `requirePlatformAdmin()`
- Host stand has separate auth (`host_stand_users`, venue-locked)

### Business Date Rule
Before 5:00 AM = previous business day. Applied everywhere: sales pace, nightly reports, forecasting, camera polling.

### Polling Architecture
- **<1min precision:** External schedulers (QStash / cron-job.org) → API endpoints
- **Hourly+:** Vercel cron (review sync, nightly rollups)

### AI Models
- **Claude Opus 4.6** — Complex reasoning (narratives, recommendations)
- **Claude Sonnet 4.5** — Faster tasks (comp review, default)
- Per-org configuration: model choice, token limits, temperature, custom prompts

### Key Metrics Tracked

| Domain | Metrics |
|--------|---------|
| Revenue | Total revenue, covers, avg check, bev %, pace status, comp exceptions |
| Labor | CPLH by position, labor cost %, staffing variance |
| Procurement | COGS variance, waste %, budget performance |
| Operations | Table turns, greeting compliance, reservation fill rate |
| Enforcement | Attestation compliance, discipline score, follow-through rate |
