# Comp Settings System - OpSOS Enforcement Engine

## Overview

The Comp Settings System provides tunable enforcement rails for comp policy compliance. Organizations calibrate thresholds and sensitivity within fixed operating standards — enforcement is continuous and non-negotiable.

**Key Capabilities:**
- ✅ **Calibrated Thresholds**: Tune sensitivity within bounded limits per organization
- ✅ **Versioned Settings**: Immutable audit trail with version control for compliance
- ✅ **SOP Generation**: Auto-generate policy documents from configured standards
- ✅ **Dynamic AI Configuration**: AI model parameters adapt per organization
- ✅ **Authority Levels**: Approval workflows scale with comp amounts

**Core Principle:** The rules are always on. The rails are fixed. Calibration is allowed. Escape is not.

---

## Integration Flow

The comp settings system integrates seamlessly with OpSOS exception detection and AI review:

```
┌──────────────────────────────────────────────┐
│  Admin configures settings in UI             │
│  /admin/comp-settings                        │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
       ┌─────────────────────┐
       │  comp_settings      │
       │  (versioned DB)     │
       └─────────┬───────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌───────────────────┐   ┌─────────────────────┐
│ Exception Detect  │   │ AI Comp Review      │
│ fetchCompExceptions│   │ reviewComps()       │
│                   │   │                     │
│ Uses settings for:│   │ Uses settings for:  │
│ • Approved reasons│   │ • Dynamic prompts   │
│ • High $ threshold│   │ • AI model config   │
│ • Daily % limits  │   │ • Context rules     │
└─────────┬─────────┘   └──────────┬──────────┘
          │                        │
          └───────────┬────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │ Control Plane    │
            │ • Actions        │
            │ • Alerts         │
            └──────────────────┘
```

**Integration Points:**

1. **Exception Detection** ([lib/database/tipsee.ts:619](../lib/database/tipsee.ts#L619))
   - `fetchCompExceptions(date, locationUuid, settings?)`
   - Validates comps against org-approved reasons
   - Flags violations based on org thresholds

2. **AI Review** ([lib/ai/comp-reviewer.ts](../lib/ai/comp-reviewer.ts))
   - `reviewComps(input, settings?)`
   - Generates dynamic prompts using org rules
   - Configures AI model per org settings

3. **API Endpoints**
   - `/api/nightly/comp-exceptions` - Fetches settings + applies to exceptions
   - `/api/ai/comp-review` - Fetches settings + applies to AI review

---

## Architecture

### Database Layer

**Table:** `comp_settings`
- Organization-level settings with version control
- RLS policies for multi-tenant security
- Audit logging for all changes
- Effective dating for historical queries

**Key Fields:**
- `approved_reasons` - JSONB array of approved comp reasons
- `high_value_comp_threshold` - Dollar amount triggering high-value review
- `daily_comp_pct_warning/critical` - Budget thresholds
- `server_max_comp_amount` - Authority limits
- `ai_model`, `ai_max_tokens`, `ai_temperature` - AI configuration

### API Endpoints

#### 1. GET `/api/comp/settings?org_id=xxx`
Retrieve active comp settings for an organization.

**Response:**
```json
{
  "success": true,
  "data": {
    "org_id": "...",
    "version": 1,
    "approved_reasons": [...],
    "high_value_comp_threshold": 200,
    "daily_comp_pct_warning": 2,
    "daily_comp_pct_critical": 3,
    ...
  }
}
```

#### 2. PUT `/api/comp/settings`
Update comp settings (creates new version).

**Request Body:**
```json
{
  "org_id": "...",
  "updates": {
    "high_value_comp_threshold": 250,
    "daily_comp_pct_warning": 2.5,
    "approved_reasons": [...]
  }
}
```

**Response:**
```json
{
  "success": true,
  "version": 2,
  "message": "Settings updated to version 2",
  "data": { ... }
}
```

#### 3. GET `/api/comp/sop?org_id=xxx&format=markdown`
Generate SOP document from settings.

**Formats:**
- `markdown` - Markdown format (default)
- `html` - Styled HTML document
- `json` - Structured JSON

**Example Output (Markdown):**
```markdown
# Comp Policy - Standard Operating Procedure

**Version:** 1
**Effective Date:** 2026-02-08

## 1. Approved Comp Reasons

1. **Guest Recovery**
   *Max: $100*

2. **Manager Meal**
   *Max: $30*

...
```

---

## Configuration Guide

### Default Settings

All organizations start with these defaults (based on h.wood Group SOPs):

```typescript
{
  // Approved comp reasons
  approved_reasons: [
    { name: 'Guest Recovery', requires_manager_approval: false, max_amount: 100 },
    { name: 'Manager Meal', requires_manager_approval: false, max_amount: 30 },
    ...
  ],

  // Thresholds
  high_value_comp_threshold: 200,      // $200+ requires manager
  high_comp_pct_threshold: 50,         // >50% of check triggers review
  daily_comp_pct_warning: 2,           // 2% of sales = warning
  daily_comp_pct_critical: 3,          // 3% of sales = critical

  // Authority levels
  server_max_comp_amount: 50,          // Servers can comp up to $50
  manager_min_for_high_value: 200,     // Managers required for $200+
  manager_roles: ['Manager', 'GM', ...],

  // AI configuration
  ai_model: 'claude-sonnet-4-5-20250929',
  ai_max_tokens: 4000,
  ai_temperature: 0.3,
}
```

### Customizing Settings

#### Example: Increase Server Authority

```bash
curl -X PUT https://your-domain.com/api/comp/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "your-org-id",
    "updates": {
      "server_max_comp_amount": 100
    }
  }'
```

#### Example: Add Custom Comp Reason

```javascript
await fetch('/api/comp/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    org_id: 'your-org-id',
    updates: {
      approved_reasons: [
        ...existingReasons,
        {
          name: 'VIP Loyalty Program',
          requires_manager_approval: true,
          max_amount: 150
        }
      ]
    }
  })
});
```

#### Example: Adjust Daily Budget Thresholds

```javascript
// Tighten budget for cost control
await updateSettings({
  daily_comp_pct_warning: 1.5,   // Down from 2%
  daily_comp_pct_critical: 2.5   // Down from 3%
});
```

---

## Integration with AI Comp Review

### How Settings Affect AI Reviews

The AI comp reviewer now uses org-specific settings to:

1. **Validate Comp Reasons**: Only flags comps with unapproved reasons
2. **Apply Thresholds**: Uses org-specific $ amounts and percentages
3. **Check Authority**: Enforces org-defined approval workflows
4. **Generate Recommendations**: Contextual to org's policy

### Example: Before vs After

**Before (Hardcoded):**
```typescript
// Everyone uses same rules
const HIGH_VALUE = 200;
const APPROVED_REASONS = ['Guest Recovery', 'Manager Meal', ...];
```

**After (Dynamic):**
```typescript
// Each org has custom rules
const settings = await getCompSettingsForVenue(venueId);
const review = await reviewComps(input, settings);

// Org A: High value = $200, strict rules
// Org B: High value = $500, relaxed rules
```

---

## Version Control & Audit Trail

### How Versioning Works

1. **Initial Version**: When org is created, version 1 is seeded with defaults
2. **Updates**: Any change creates a new version (v2, v3, ...)
3. **Effective Dating**: Each version has `effective_from` and `effective_to`
4. **Historical Queries**: Can retrieve settings as of any date

### Example: Historical Query

```typescript
// What were the comp settings on Jan 1, 2026?
const settings = await getCompSettingsAt(
  orgId,
  new Date('2026-01-01')
);

// Run historical comp review with those settings
const review = await reviewComps(historicalData, settings);
```

### Audit Log

All setting changes are logged in `settings_audit_log`:

```sql
SELECT * FROM settings_audit_log
WHERE table_name = 'comp_settings'
  AND record_id = 'your-org-id'
ORDER BY changed_at DESC;
```

**Output:**
| Field | Old Value | New Value | User | Changed At |
|-------|-----------|-----------|------|------------|
| `high_value_comp_threshold` | 200 | 250 | john@example.com | 2026-02-08 14:30 |
| `daily_comp_pct_warning` | 2 | 1.5 | jane@example.com | 2026-02-07 09:15 |

---

## SOP Generation

### Use Cases

1. **Onboarding**: Generate SOP for new employees
2. **Training**: Reference document for comp policies
3. **Compliance**: Show auditors your enforced policies
4. **Updates**: Re-generate when settings change

### Generating SOPs

#### Via API

```bash
# Markdown (default)
curl https://your-domain.com/api/comp/sop?org_id=xxx

# HTML (styled)
curl https://your-domain.com/api/comp/sop?org_id=xxx&format=html

# JSON (structured)
curl https://your-domain.com/api/comp/sop?org_id=xxx&format=json
```

#### Via UI (Future)

```
Settings > Comp Policy > Generate SOP
```

### Sample SOP Output

See generated SOPs in `markdown`, `html`, or `json` formats that include:
- Approved comp reasons with limits
- Threshold definitions
- Authority levels
- Documentation requirements
- Enforcement policies
- Version information

---

## Database Functions

### `get_active_comp_settings(org_id)`

Returns currently active settings for an organization.

```sql
SELECT * FROM get_active_comp_settings('your-org-id');
```

### `get_comp_settings_at(org_id, as_of_date)`

Returns settings active at a specific date (for historical analysis).

```sql
SELECT * FROM get_comp_settings_at(
  'your-org-id',
  '2026-01-01'::timestamptz
);
```

---

## Security & Permissions

### Row Level Security (RLS)

- **View**: Users can view settings for their own organization
- **Update**: Only org admins can update settings
- **Insert**: System-only (for seeding)

### API Authorization

```typescript
// User must be in organization
await verifyOrgAccess(request, orgId);

// User must be admin to update
await verifyOrgAdmin(request, orgId);
```

---

## Migration & Rollout

### Step 1: Apply Migration

```bash
# Run migration
supabase migration up 1000_comp_settings.sql

# Verify
psql -c "SELECT * FROM comp_settings LIMIT 5;"
```

### Step 2: Seed Default Settings

Default settings are automatically created for all existing organizations during migration.

### Step 3: Calibrate Per Org

Use API or admin UI to calibrate enforcement thresholds for each organization.

### Step 4: Monitor

- Check AI comp review logs
- Review exception rates
- Adjust thresholds as needed

---

## Future Enhancements

### Phase 2 (Planned)
- [ ] Admin UI for settings management
- [ ] Role-based approval workflows (multi-tier)
- [ ] Time-of-day rules (e.g., happy hour comps)
- [ ] Venue-specific overrides (within org)
- [ ] Seasonal threshold adjustments
- [ ] Integration with inventory (comp limits per item)

### Phase 3 (Roadmap)
- [ ] ML-based threshold recommendations
- [ ] Anomaly detection tuning
- [ ] Custom comp categories
- [ ] Multi-language SOP generation
- [ ] Comp forecasting based on settings

---

## Troubleshooting

### Settings Not Applying

**Check active version:**
```sql
SELECT version, effective_from, effective_to
FROM comp_settings
WHERE org_id = 'your-org-id'
  AND is_active = true
ORDER BY version DESC;
```

**Verify API is fetching settings:**
```typescript
const settings = await getCompSettingsForVenue(venueId);
console.log('Using settings:', settings);
```

### AI Review Using Wrong Thresholds

**Check if settings are passed to reviewer:**
```typescript
// ❌ Wrong - uses defaults
await reviewComps(input);

// ✅ Correct - uses org settings
const settings = await getCompSettingsForVenue(venueId);
await reviewComps(input, settings);
```

### Historical Reviews Not Working

**Use time-specific query:**
```typescript
// Get settings as of review date
const settings = await getCompSettingsAt(orgId, reviewDate);
const review = await reviewComps(historicalData, settings);
```

---

## Related Documentation

- [AI Comp Review System](./AI_COMP_REVIEW.md)
- [Control Plane Architecture](./CONTROL_PLANE.md)
- [Settings Versioning (P0)](./P0_DELIVERABLES.md)
- [TipSee Integration](./TIPSEE_INTEGRATION.md)

---

**Questions?** Contact the OpSOS team or see [COMPLETE_SYSTEM_DOCUMENTATION.md](./COMPLETE_SYSTEM_DOCUMENTATION.md)
