# Enforcement Engine Architecture

> KevaOS is fundamentally an enforcement engine. The rules are always on. The rails are fixed. Calibration is allowed. Escape is not.

## Core Principle

Comp settings and operational standards are **tunable rails** — calibration within fixed standards, NOT optional enforcement.

```
Settings Configuration → Exception Detection → AI Review → Control Plane Actions
```

**Critical Distinction**: Tunable does not mean optional.
- Rules are ALWAYS ON (non-negotiable)
- Rails are FIXED (standards exist)
- Calibration is ALLOWED (thresholds can be tuned within bounds)
- Escape is NOT (enforcement cannot be disabled)

## Comp Policy Enforcement

### Settings (P0 Version Control)

| Setting | Default |
|---|---|
| High value comp threshold | $200 |
| Server max comp | $50 |
| Daily budget warning | 2% of revenue |
| Daily budget critical | 3% of revenue |
| Approved comp reasons | 19 (h.wood Group SOPs) |
| AI model | Claude Sonnet 4.5, 4000 tokens, 0.3 temp |

Settings are immutable rows with version chains and effective dating.
Fallback order: Defaults → Org settings → Venue overrides.

### Exception Detection Flow

1. `fetchCompExceptions()` validates comps against org-approved reasons
2. Flags violations using org-specific thresholds
3. AI review via `reviewComps()` with dynamic prompts from settings
4. Results delivered to control plane for manager action

### Admin Configuration

- Full CRUD for approved comp reasons
- Threshold tuning (high value, daily %, server max)
- Version history viewer with audit trail
- Import/export settings (JSON)
- Logo upload for branded SOP documents
- Multi-format SOP generation (HTML, Markdown, JSON)

## Attestation Workflow

```
Exception Detected → Attestation Created → Manager Reviews → Narrative Generated → Coaching/Resolution
```

Attestation types:
- Revenue attestation
- Labor attestation (FOH/BOH)
- Comp resolution
- Entertainment feedback
- Culinary feedback
- Guest module

## Violation State Machine

Managed in `lib/enforcement/state-machine.ts`:
- Intake policy enforcement (`lib/enforcement/intake-policy.ts`)
- Carry-forward rules (`lib/enforcement/carry-forward.ts`)
- Escalation tracking (`lib/enforcement/escalation.ts`)
- Scoring (`lib/enforcement/scoring.ts`)

## Language & Positioning (CRITICAL)

**NEVER USE** (implies customers control the system):
- "organizational autonomy", "their own rules", "fully adaptable"
- "organization-defined logic", "respects organizational preferences"

**ALWAYS USE** (preserves enforcement spine):
- "calibrated thresholds within fixed standards"
- "bounded sensitivity tuning"
- "enforcement is continuous and non-negotiable"
- "tunable rails, not optional rules"
- "fixed operating standard with calibration"

## Key Files

| File | Purpose |
|---|---|
| `lib/database/comp-settings.ts` | Settings types & queries |
| `lib/ai/comp-reviewer.ts` | AI comp review with org settings |
| `lib/enforcement/state-machine.ts` | Violation lifecycle |
| `lib/enforcement/intake-policy.ts` | Intake enforcement |
| `lib/database/enforcement.ts` | Violation tracking |
| `app/api/comp/settings/route.ts` | Settings API |
| `app/api/comp/sop/route.ts` | SOP generation API |
| `app/api/ai/comp-review/route.ts` | AI review API |
| `supabase/migrations/40000000000000_comp_settings.sql` | Schema |
