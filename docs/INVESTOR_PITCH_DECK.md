# OpsOS — Investor Pitch Deck

> Daily Operational Control for Multi-Unit Restaurants
> Confidential

---

## SLIDE 1 — Title

**OpsOS**

The operating system that enforces daily operations — so the same problems don't happen twice.

*Executive Overview | Confidential*

---

## SLIDE 2 — The Problem

### Restaurants don't fail because they lack data. They fail because nothing forces problems to get fixed.

Every operator already has reports, dashboards, weekly meetings, and explanations. And still: labor drifts, food cost leaks, comps repeat, and the same conversations happen again next week.

**Real example:** A single high-volume venue had 24 staff arriving at 4:30 PM despite minimal early evening sales — with **$621K in annual labor savings** sitting in plain sight for months. The data was always there. No one was forced to act on it.

The issue isn't visibility. It's accountability.

**$900B industry. 60% failure rate. The gap isn't data — it's follow-through.**

---

## SLIDE 3 — What OpsOS Is

### A daily operational control system.

OpsOS ingests what already happened — sales, labor, purchasing — and forces ownership of deviations through required feedback, attestations, and verification.

OpsOS doesn't show managers what happened. It tells them what they must respond to — and proves whether behavior actually changed.

**What makes it different:**

| Most tools stop at insight | OpsOS goes to intervention |
|---|---|
| Dashboards | Feedback |
| Reports | Required responses |
| Planning | Commitments |
| Analytics | Verification |

If a problem repeats, OpsOS escalates it automatically.
If it's resolved, OpsOS proves it.

That's the difference between software and a system.

---

## SLIDE 4 — How It Works

### Every day, OpsOS runs the same closed loop.

```
INGEST → DETECT → TRANSLATE → REQUIRE → CARRY FORWARD → VERIFY
```

| Step | What Happens |
|---|---|
| **1. Ingest** | Pull actual results from POS, labor, and invoices |
| **2. Detect** | Identify deviations from standards and prior commitments |
| **3. Translate** | Convert deviations into plain-language feedback managers can act on |
| **4. Require** | Managers must acknowledge, explain, or correct — no silent passes |
| **5. Carry Forward** | Unresolved issues flow into preshift instructions automatically |
| **6. Verify** | Confirm whether behavior actually changed the next day |

Nothing is silent. Nothing is optional. Nothing disappears without ownership.

---

## SLIDE 5 — The Control Surface

### Seven integrated enforcement modules. One closed loop.

| Module | What It Controls | How It Enforces |
|---|---|---|
| **Sales Pace** | Real-time 5-min revenue monitoring during service | Pace alerts when projected EOD falls below forecast |
| **Comp Control** | AI-reviewed comps against approved reasons and authority levels | Every unapproved comp requires documented resolution |
| **Labor Control** | Schedule efficiency, CPLH, shift-level variance | Labor deviations generate mandatory attestation items |
| **Invoice & Cost** | OCR ingestion, vendor scoring, cost spike detection | Cost anomalies block approval; spikes surface immediately |
| **Inventory** | Count variance, recipe costing, shrink tracking | Variance exceeding threshold requires explanation |
| **Camera Vision** | Table greeting detection via computer vision | Service time violations surface as action items |
| **Nightly Attestation** | Manager sign-off linking all deviations | Cannot be skipped. Digital signature. Permanent record. |

Each module feeds the same loop. Detect. Require. Verify.

---

## SLIDE 6 — Live During Service: Sales Pace

### Not end-of-night regret. Real-time operational awareness.

During every service, operators see:
- **Revenue vs forecast** — updated every 5 minutes
- **Covers, avg check, category mix** — food/bev split in real time
- **EOD projection** — based on current velocity and remaining service hours
- **Same-day-last-week comparison** — instant context
- **Group-wide view** — all venues on one screen

Works on any device. No app install. Standalone PWA.
Supports multiple POS systems (Toast, Square, Simphony) — auto-detects per venue.

**Why it matters:** By the time a nightly report arrives, the shift is over. Pace monitoring turns mid-service awareness into mid-service action.

---

## SLIDE 7 — AI as Infrastructure, Not Autonomy

### AI powers the system. Humans own the decisions.

OpsOS uses AI to make the loop faster and smarter — but never to replace the accountability it creates.

| AI Capability | What It Does | What It Doesn't Do |
|---|---|---|
| **Comp Review** | Analyzes comps against org rules, flags severity | Never auto-approves or closes exceptions |
| **Invoice OCR** | Extracts vendor, items, amounts from PDFs | Never auto-pays; routes to human approval |
| **Camera Vision** | Detects seated customers, measures greeting time | Never takes action; surfaces metrics only |
| **Feedback Translation** | Converts data deviations into plain-language preshift notes | Never replaces manager judgment |
| **Chatbot** | Answers natural-language queries about sales, labor, cost | Information only; never modifies data |

AI settings are configurable per organization — model, sensitivity, thresholds.

**Why this matters:** As AI commoditizes dashboards and analytics, the enforcement layer remains defensible. AI makes OpsOS smarter. It doesn't replace the system.

---

## SLIDE 8 — Camera Vision (Proprietary)

### We own the detection pipeline. Service quality becomes measurable.

**Table greeting detection — from camera snapshot to enforcement metric:**

1. Camera captures snapshot (UniFi Protect via Cloud Connector)
2. Scene change detection skips redundant frames (60-80% cost reduction)
3. Claude Vision analyzes against custom polygon zones per venue
4. Events correlate: seated detection → approach → greeted timestamp
5. Metrics compute: avg greeting time, P90, threshold compliance

**What this enables:**
- Service quality measured objectively, not by anecdote
- Greeting SLA breaches surface as action items in the nightly loop
- Per-venue configuration: thresholds, polling frequency, zone layout

**Expansion roadmap:**
- Table turn time detection
- Plate clearance timing
- Staff positioning analysis
- Queue and wait time monitoring
- Kitchen window ticket aging

Camera vision opens an **entirely new enforcement surface** that no competitor has.

---

## SLIDE 9 — What OpsOS Replaces (and Doesn't)

### OpsOS is the control plane. Not another point solution.

**OpsOS replaces:**
- Scheduling tools that plan but don't enforce
- Food cost tools that report but don't change behavior
- Nightly reports no one acts on
- Weekly meetings about last week's problems
- Spreadsheets tracking who said what

**OpsOS does not replace:**
- POS systems (Toast, Square, Simphony)
- Payroll and time clocks
- Accounting software (R365, QuickBooks)
- Inventory management hardware

OpsOS sits **above** these systems as the operational control layer. It ingests their data, detects deviations, and forces follow-through that the underlying tools never will.

---

## SLIDE 10 — Who It's For

### Operators managing 3+ locations who need consistency without adding headcount.

**Primary:** Multi-unit restaurant groups (3–50+ venues)

| Who | What They Get |
|---|---|
| **Owners** | Fewer surprises. Verified accountability without more meetings. |
| **Operators** | Fewer repeat issues. Problems close instead of recurring. |
| **Investors** | Real accountability without additional management headcount. |

If your portfolio is growing and your ops team isn't scaling with it, OpsOS is the layer that closes the gap.

**Why multi-unit:**
- Single-unit restaurants can survive on gut feel
- At 3+ venues, the operator physically cannot be everywhere
- Pain scales non-linearly: 2x venues = 4x accountability gaps
- Enforcement replaces the operator's physical presence

**Addressable market:** ~7,200 multi-unit restaurant groups in the US

---

## SLIDE 11 — The Financial Case

### 6–12% labor cost reductions within 90 days — without cutting service levels.

**For a 5-location group doing $25M in revenue:**

| Savings Area | Annual Impact |
|---|---|
| **Labor optimization** | $500K – $1M (6-12% of labor cost) |
| **Food cost control** | $75K – $200K (cost spike + shrink reduction) |
| **Comp enforcement** | $25K – $75K (unapproved comp elimination) |
| **Total margin improvement** | **$600K – $1.3M/year** |

OpsOS doesn't just provide visibility into savings. It creates the mechanism that makes them stick.

**Customer ROI:**
- OpsOS cost: ~$75K–$150K/yr for a 5-venue group
- Verified savings: $600K–$1.3M/yr
- **ROI: 4–10x**
- Payback period: < 90 days

---

## SLIDE 12 — Business Model

### Platform subscription + verified savings participation.

| Component | Model | Annual (5-venue group) |
|---|---|---|
| **Platform fee** | $750–$1,500/venue/month | $45K – $90K |
| **Savings participation** | 10–15% of verified improvements | $60K – $150K |
| **Vision add-on** | $200–$400/camera/month | $12K – $24K |
| **Implementation** | One-time onboarding | $10K – $15K |

**Target unit economics:**
- Gross margin: 80%+
- Net revenue retention: 130%+ (venue expansion + module adoption)
- CAC payback: < 12 months
- LTV/CAC: > 5x

**Why savings participation matters:** It aligns incentives completely. We only win when they save. And because OpsOS creates the audit trail, savings are verifiable — not estimated.

---

## SLIDE 13 — Competitive Landscape

### Most tools stop at insight. OpsOS is the only system that goes to intervention.

| Category | Examples | What They Do | What They Don't |
|---|---|---|---|
| **POS Analytics** | Toast, Square | Report what happened | Force anyone to respond |
| **Food Cost** | MarginEdge, BlueCart | Track food cost | Change purchasing behavior |
| **Back Office** | Restaurant365, Compeat | Accounting + inventory | Enforce operational standards |
| **Labor** | 7shifts, Lineup.ai | Schedule + forecast | Verify behavior changed |
| **BI/Dashboards** | Avero, Plate IQ | Visualize data | Close the accountability loop |

**OpsOS is the only platform that:**
1. Detects the deviation
2. Requires the response
3. Carries it forward if unresolved
4. Verifies the behavior actually changed

No one else does step 2, 3, or 4. That's the entire value.

---

## SLIDE 14 — Defensibility

### Four reinforcing moats.

**1. Behavioral Lock-In**
OpsOS becomes the nightly operating record. Removing it means losing the accountability infrastructure — not just a dashboard. Managers build habits. Operators build processes. The system becomes organizational muscle memory.

**2. Data Compounding**
Every night of attestation data improves exception detection. Cross-venue patterns emerge. Historical audit trails become irreplaceable institutional knowledge. More data creates better enforcement creates more value.

**3. Integration Depth**
Multi-POS canonical model (Toast, Square, Simphony) with check-item-level detail. Accounting export (R365). Labor system integration. This is months of integration work per customer — work competitors would have to replicate.

**4. Proprietary Vision**
Custom polygon detection pipeline via Claude Vision. Scene change optimization. Normalized coordinate system. No dependency on camera vendor AI. Expanding from greeting detection to full service quality monitoring.

---

## SLIDE 15 — Traction

### Built by operators. Live in production. Verified outcomes.

**Current deployment:**
- Live across h.wood Group venues (one of the most recognized hospitality groups in the US)
- Multiple POS integrations operational (Toast, Square, Simphony)
- Nightly attestation loop running every night
- Real-time sales pace monitoring in daily use
- Camera vision pipeline deployed and collecting metrics

**Platform maturity:**
- 232 database migrations — this is not an MVP
- 166 API endpoints across all modules
- 60+ database tables with row-level security
- Full AI integration (comp review, OCR, vision, chatbot)
- Complete invoice pipeline with 3-way matching

**Verified outcomes:**
- $621K in annual labor savings identified at a single venue
- 6–12% labor cost reductions within 90 days
- Every unapproved comp surfaced and resolved
- End-of-night surprises replaced with mid-service awareness

---

## SLIDE 16 — Roadmap

### Expanding the control surface.

**Now → Q2 2026:**
- Multi-tenant onboarding (self-service org setup)
- Mobile-native attestation and preshift experience
- Expanded camera vision (table turns, plate clearance, queue times)
- Additional POS integrations (Aloha, Micros)

**Q3–Q4 2026:**
- Verified savings dashboard (outcome-based pricing engine)
- Predictive exception detection (flag issues before they happen)
- Vendor negotiation intelligence (cross-org purchasing leverage)
- White-label partner program

**2027+:**
- Full autonomous service quality monitoring (vision)
- Cross-org benchmarking
- International expansion
- Adjacent verticals (hotels, stadiums, corporate dining)

---

## SLIDE 17 — Team

### Built by the operators who live with the problem every night.

**Jacob Shrue — Founder & CEO**
- Operator at h.wood Group — one of the most recognized hospitality groups in the US
- Built OpsOS to solve his own operational pain across multiple high-volume venues
- Deep domain expertise: nightlife, fine dining, multi-venue operations

*"I built this because I was tired of hearing about problems the next day that should have been caught in real time."*

**[Additional team members — to be added]**

**Why operator-founders win in restaurant tech:**
- They know which problems actually matter — not just which ones demo well
- They understand operators don't need more data — they need more accountability
- They build for enforcement because they've lived what happens without it

---

## SLIDE 18 — The Ask

### Raising $[X]M to scale daily operational control across the restaurant industry.

**Use of funds:**

| Category | Allocation | Purpose |
|---|---|---|
| **Engineering** | 45% | Multi-tenant scaling, POS integrations, vision expansion, mobile |
| **Go-to-Market** | 30% | Enterprise sales, restaurant group partnerships, industry events |
| **Customer Operations** | 15% | Onboarding, implementation, success team |
| **G&A** | 10% | Legal, compliance (SOC 2), infrastructure |

**This raise enables:**
1. 10+ multi-unit restaurant groups on the platform (100+ total venues)
2. 3 additional POS integrations (Aloha, Micros, Lightspeed)
3. Outcome-based pricing launched with verified savings attribution
4. Camera vision V2 — table turns, queue detection, kitchen monitoring
5. SOC 2 Type II certification for enterprise sales

---

## SLIDE 19 — The Outcome

### With OpsOS, managers spend less time explaining and more time fixing.

Issues close instead of recurring.
Leadership sees fewer surprises.
Operations become predictable.

OpsOS doesn't make operations perfect.
**It makes them correctable.**

---

**OpsOS**
Daily Operational Control
Confidential

*[contact info]*

---

## APPENDIX A — Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    OpsOS PLATFORM                        │
│                                                          │
│  DATA SOURCES          CONTROL ENGINE       ENFORCEMENT  │
│  ┌──────────┐         ┌──────────────┐    ┌───────────┐ │
│  │ POS      │────────▶│  Exception   │───▶│ Required  │ │
│  │ Toast    │         │  Detection   │    │ Response  │ │
│  │ Square   │         │              │    │           │ │
│  │ Simphony │         │  Standards   │    │ Nightly   │ │
│  ├──────────┤         │  vs Actual   │    │ Attest    │ │
│  │ Labor    │────────▶│              │    │           │ │
│  │ Schedules│         │  AI Review   │    │ Task      │ │
│  │ Timeclock│         │  (Claude)    │    │ Assign    │ │
│  ├──────────┤         │              │    │           │ │
│  │ Invoices │────────▶│  Trend       │    │ Carry     │ │
│  │ OCR      │         │  Detection   │    │ Forward   │ │
│  │ Vendors  │         │              │    │           │ │
│  ├──────────┤         │  Camera      │    │ Verify    │ │
│  │ Cameras  │────────▶│  Vision      │───▶│ Change    │ │
│  │ UniFi    │         │  Pipeline    │    │           │ │
│  └──────────┘         └──────────────┘    └───────────┘ │
│                                                          │
│  Next.js 14 │ Supabase PostgreSQL │ Claude AI │ Vercel   │
└──────────────────────────────────────────────────────────┘
```

## APPENDIX B — Platform Scale

| Metric | Count |
|---|---|
| Database migrations | 232 |
| Core tables | 60+ |
| API endpoints | 166 |
| POS integrations | 3 (Toast, Square, Simphony) |
| AI-powered features | 6 (comp review, OCR, vision, chatbot, forecast, matching) |
| Scheduled enforcement jobs | 5+ |
| Dashboard pages | 30+ |

## APPENDIX C — Glossary

| Term | Definition |
|---|---|
| **Attestation** | Nightly manager sign-off with digital signature covering all deviations |
| **CPLH** | Cost Per Labor Hour — labor efficiency metric |
| **SPLH** | Sales Per Labor Hour — revenue efficiency metric |
| **SDLW** | Same Day Last Week — comparison benchmark |
| **Live Pulse** | Real-time sales monitoring PWA with 5-min updates |
| **Control Plane** | The enforcement layer that sits above POS, payroll, and accounting |
| **Exception** | Auto-detected deviation requiring human explanation |
| **Carry Forward** | Unresolved issues that automatically flow into the next day's preshift |
