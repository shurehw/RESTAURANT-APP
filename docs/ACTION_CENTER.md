# OpSOS Action Center — Unified Enforcement System

The Action Center is the **enforcement delivery layer** for all OpSOS systems. It ingests violations from any source (comps, sales pace, greetings, staffing) and routes them to appropriate enforcement actions.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  DETECTION SOURCES                                      │
│  - Comp exceptions                                      │
│  - Sales pace violations                                │
│  - Greeting delays                                      │
│  - Staffing gaps                                        │
│  - (any future enforcement source)                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  CONTROL PLANE (Unified)                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Violations Table                                 │   │
│  │ - Standardized violation records                 │   │
│  │ - Links to source data                           │   │
│  │ - Severity classification                        │   │
│  └─────────────────────────────────────────────────┘   │
│                        ↓                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Action Templates                                 │   │
│  │ - Org-specific rules                             │   │
│  │ - "If comp > $200 → alert GM + block server"    │   │
│  └─────────────────────────────────────────────────┘   │
│                        ↓                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Actions Queue                                    │   │
│  │ - Alerts (email, Slack, push)                    │   │
│  │ - Blocks (prevent operations)                    │   │
│  │ - Overrides (require approval)                   │   │
│  │ - Escalations (route to authority)               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  ACTION DELIVERY                                        │
│  - Email via Resend                                     │
│  - Slack via webhooks                                   │
│  - Push notifications                                   │
│  - External system blocks (scheduling, POS)             │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### `control_plane_violations`
Standardized violation records from any source.

```sql
create table control_plane_violations (
  id uuid primary key,
  org_id uuid not null,
  venue_id uuid,

  -- Classification
  violation_type text, -- 'comp_exception', 'sales_pace', 'greeting_delay', 'staffing_gap'
  severity text,       -- 'info', 'warning', 'critical'

  -- Details
  title text not null,
  description text,
  metadata jsonb,      -- Type-specific data

  -- Source
  source_table text,   -- Link back to original record
  source_id text,

  -- Lifecycle
  detected_at timestamptz,
  resolved_at timestamptz,
  business_date date
);
```

### `control_plane_actions`
Actions to execute (alerts, blocks, etc.)

```sql
create table control_plane_actions (
  id uuid primary key,
  violation_id uuid references control_plane_violations,

  action_type text,     -- 'alert', 'block', 'require_override', 'escalate'
  action_target text,   -- email, user_id, system_name
  message text,
  action_data jsonb,

  -- Execution
  scheduled_for timestamptz,
  executed_at timestamptz,
  execution_status text  -- 'pending', 'delivered', 'failed', 'dismissed'
);
```

### `control_plane_action_templates`
Org-specific rules for auto-creating actions.

```sql
create table control_plane_action_templates (
  id uuid primary key,
  org_id uuid not null,

  -- Trigger
  violation_type text,
  severity text,

  -- Action
  action_type text,
  action_target text,       -- Can include variables: {{gm_email}}
  message_template text,    -- "{{venue_name}} is {{gap}} FTE below minimum"

  -- Conditions
  enabled boolean,
  conditions jsonb          -- {"min_threshold": 0.5}
);
```

### `control_plane_blocks`
Active blocks (prevent operations until lifted).

```sql
create table control_plane_blocks (
  id uuid primary key,
  violation_id uuid references control_plane_violations,

  block_type text,          -- 'manager_assignment', 'comp_approval', 'section_opening'
  blocked_entity_id uuid,   -- manager_id, employee_id, etc.
  blocked_entity_type text,
  reason text,
  active boolean,

  -- Override
  override_required boolean,
  override_authority text,  -- 'gm', 'vp_ops'

  -- Lifecycle
  lifted_at timestamptz
);
```

## Integration Pattern

### 1. Report Violation

When your enforcement source detects a violation:

```typescript
import { createViolation, createActionsFromTemplates } from '@/lib/database/action-center';

// Example: Comp exception detected
const violation = await createViolation({
  org_id: 'org_123',
  venue_id: 'venue_456',
  violation_type: 'comp_exception',
  severity: 'critical',
  title: 'Unauthorized comp: $250',
  description: 'Server John comped $250 without GM approval',
  metadata: {
    comp_id: 'comp_789',
    server_name: 'John',
    comp_amount: 250,
    comp_reason: 'VIP guest'
  },
  source_table: 'comp_exceptions',
  source_id: 'comp_789',
  business_date: '2024-02-14'
});

// Auto-create actions from templates
await createActionsFromTemplates(violation);
```

### 2. Configure Action Templates

Set up org-specific rules:

```typescript
// Template: High-value comps → alert GM + block server
await createActionTemplate({
  org_id: 'org_123',
  violation_type: 'comp_exception',
  severity: 'critical',
  action_type: 'alert',
  action_target: 'gm@venue.com',
  message_template: 'ALERT: {{metadata.server_name}} comped ${{metadata.comp_amount}} at {{venue_name}}',
  enabled: true
});

await createActionTemplate({
  org_id: 'org_123',
  violation_type: 'comp_exception',
  severity: 'critical',
  action_type: 'block',
  action_target: 'system',
  message_template: 'Server blocked from comps >$50 until review',
  enabled: true
});
```

### 3. Process Actions (Cron)

Run every 5 minutes via external scheduler:

```bash
curl -X POST https://yourapp.com/api/action-center/process \
  -H "Authorization: Bearer $CRON_SECRET"
```

This:
- Fetches pending actions
- Delivers alerts (email, Slack, etc.)
- Creates blocks in external systems
- Routes override requests
- Escalates issues

### 4. Check Blocks (External Systems)

Your scheduling/POS systems query before operations:

```typescript
// Before assigning manager to second venue
const blockStatus = await fetch('/api/action-center/blocks?block_type=manager_assignment&entity_id=dean_user_id');

if (blockStatus.blocked) {
  return {
    allowed: false,
    reason: blockStatus.reason,
    override_required: true,
    override_authority: 'vp_ops'
  };
}
```

## Example Integrations

### Comp Exceptions

```typescript
import { reportCompViolation } from '@/lib/action-center/integrations';

// In your nightly comp exception scan
const exceptions = await fetchCompExceptions(venueId, businessDate);

for (const exception of exceptions) {
  await reportCompViolation(orgId, exception);
}
```

### Sales Pace

```typescript
import { reportSalesPaceViolation } from '@/lib/action-center/integrations';

// In your 5-minute sales pace poll
const paceStatus = await computePaceStatus(venueId);

if (paceStatus.pace_status !== 'on_pace') {
  await reportSalesPaceViolation(orgId, paceStatus);
}
```

### Greeting Delays

```typescript
import { reportGreetingViolation } from '@/lib/action-center/integrations';

// In your camera vision poll
if (delaySeconds > thresholdSeconds) {
  await reportGreetingViolation(orgId, {
    id: metricId,
    venue_id: venueId,
    business_date: businessDate,
    table_number: '12',
    seated_at: seatedAt,
    delay_seconds: delaySeconds,
    threshold_seconds: thresholdSeconds
  });
}
```

### Staffing Gaps

```typescript
import { reportStaffingViolation } from '@/lib/action-center/integrations';

// In your weekly staffing scan
const gaps = await computeStaffingGaps(venueId);

for (const gap of gaps) {
  if (gap.gap_fte > 0) {
    await reportStaffingViolation(orgId, gap, businessDate);
  }
}
```

## Operator Dashboard

View all active violations in one feed:

**URL:** `/action-center`

Displays:
- Critical violations (red)
- Warnings (yellow)
- Info (blue)

Each violation shows:
- Title and description
- Venue and time
- Actions created (alerts, blocks)
- Related data links

## API Endpoints

### `POST /api/action-center/violations`
Create a new violation (called by enforcement sources)

**Auth:** API key or user session

**Body:**
```json
{
  "org_id": "org_123",
  "venue_id": "venue_456",
  "violation_type": "comp_exception",
  "severity": "critical",
  "title": "Unauthorized comp",
  "description": "...",
  "metadata": {},
  "source_table": "comp_exceptions",
  "source_id": "comp_789",
  "business_date": "2024-02-14"
}
```

### `GET /api/action-center/violations`
Query violations

**Query params:**
- `mode=active` - Active violations only
- `mode=range&start_date=...&end_date=...` - Date range
- `severity=critical|warning|info` - Filter by severity
- `venue_id=...` - Filter by venue
- `violation_type=...` - Filter by type

### `POST /api/action-center/process`
Process pending actions (cron target)

**Auth:** Bearer token (`CRON_SECRET`)

### `GET /api/action-center/blocks`
Check if entity is blocked

**Query params:**
- `mode=check&block_type=...&entity_id=...` - Check specific entity
- `mode=list` - List all active blocks

**Response:**
```json
{
  "blocked": true,
  "reason": "Venue understaffed by 0.4 FTE",
  "override_required": true,
  "override_authority": "vp_ops"
}
```

### `POST /api/action-center/blocks/:id/lift`
Lift a block

**Body:**
```json
{
  "lift_reason": "Staffing gap resolved"
}
```

## Migration Path

### Phase 1: Parallel Systems ✅ (Current)
- Existing enforcement sources continue working
- Control plane runs alongside (no impact)
- Gradually integrate sources to report violations

### Phase 2: Unified Actions
- Migrate comp review actions to action center
- Migrate sales pace alerts to action center
- Retire legacy action systems

### Phase 3: External Integrations
- Scheduling system checks blocks before operations
- POS system enforces comp approval blocks
- All enforcement flows through action center

## Best Practices

### 1. Use Templates for Automation
Don't hardcode actions in detection logic. Configure templates per org.

❌ **Bad:**
```typescript
if (compAmount > 200) {
  await sendEmail('gm@venue.com', 'High comp alert');
  await blockServer(serverId);
}
```

✅ **Good:**
```typescript
await createViolation({
  violation_type: 'comp_exception',
  severity: 'critical',
  // ... rest of data
});
await createActionsFromTemplates(violation);
```

### 2. Include Rich Metadata
Store all relevant context for later analysis.

```typescript
metadata: {
  comp_id: exception.id,
  server_name: exception.server_name,
  comp_amount: exception.comp_amount,
  comp_reason: exception.comp_reason,
  approved: exception.approved,
  manager_name: exception.manager_name,
  time_of_day: exception.time,
  check_total: exception.check_total,
  // ... any other useful data
}
```

### 3. Link Back to Source
Always include `source_table` and `source_id` so violations trace back to original data.

### 4. Resolve Violations When Fixed
When the underlying issue is resolved, close the violation:

```typescript
await resolveViolation(
  violationId,
  userId,
  'Server retrained on comp policy'
);
```

## Future Enhancements

### Short Term
- [ ] Email delivery via Resend
- [ ] Slack webhook delivery
- [ ] Push notifications

### Medium Term
- [ ] Override approval workflow
- [ ] Violation trends dashboard
- [ ] Auto-resolve violations when source data changes

### Long Term
- [ ] ML-based violation prioritization
- [ ] Predictive enforcement (flag before violation occurs)
- [ ] Cross-violation pattern detection

## Related Files

- **Migration:** `supabase/migrations/227_control_plane.sql`
- **Data Layer:** `lib/database/action-center.ts`
- **Integrations:** `lib/action-center/integrations.ts`
- **APIs:** `app/api/action-center/*/route.ts`
- **Dashboard:** `app/(dashboard)/action-center/page.tsx`
