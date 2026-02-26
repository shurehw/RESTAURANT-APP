/**
 * Intake Policy Enforcement
 *
 * Validates invoices against preferred vendor preferences and
 * canonical item specifications.
 *
 * THESIS: The rules are always on. The rails are fixed.
 *         Calibration is allowed. Escape is not.
 *
 * - Enforcement levels are 'warn' or 'block' — no 'off' mode
 * - On RPC error, the system fails CLOSED (blocks the invoice)
 * - Overrides require authority verification and escalate to control plane
 *
 * Flow:
 *   1. Invoice created (OCR or manual)
 *   2. checkIntakePolicy() runs against matched line items
 *   3. Violations recorded to intake_policy_violations + control_plane_violations
 *   4. Block-severity violations gate invoice approval until overridden
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface IntakePolicySettings {
  intake_vendor_enforcement: 'warn' | 'block';
  intake_spec_enforcement: 'warn' | 'block';
  intake_spec_fields: string[];
  intake_block_requires_override: boolean;
  intake_override_role: string;
}

export interface IntakePolicyViolation {
  invoice_line_id: string;
  item_id: string | null;
  vendor_id: string;
  violation_type: 'non_preferred_vendor' | 'spec_mismatch' | 'spec_missing';
  severity: 'info' | 'warning' | 'critical';
  enforcement_action: 'warn' | 'block';
  field_name?: string;
  expected_value?: string;
  actual_value?: string;
  message: string;
}

export interface IntakePolicyResult {
  violations: IntakePolicyViolation[];
  blocked: boolean;
  error?: string; // Non-empty when enforcement failed closed
  summary: {
    vendor_violations: number;
    spec_violations: number;
    total: number;
    highest_severity: 'info' | 'warning' | 'critical';
  };
}

// ── Check ──────────────────────────────────────────────────────

/**
 * Run intake policy checks against an invoice.
 * Calls the `check_intake_policy` SQL function and maps results
 * through settings to determine enforcement actions.
 *
 * FAIL CLOSED: If the RPC errors, returns a synthetic critical
 * violation that blocks the invoice until the system recovers.
 */
export async function checkIntakePolicy(
  invoiceId: string,
  orgId: string,
  settings: IntakePolicySettings
): Promise<IntakePolicyResult> {
  const supabase = getServiceClient();

  const { data: rawViolations, error } = await (supabase as any).rpc('check_intake_policy', {
    p_invoice_id: invoiceId,
    p_org_id: orgId,
  });

  // FAIL CLOSED: If detection fails, block until system is verified
  if (error) {
    console.error('[IntakePolicy] check_intake_policy error — failing closed:', error.message);
    return {
      violations: [{
        invoice_line_id: '',
        item_id: null,
        vendor_id: '',
        violation_type: 'spec_missing',
        severity: 'critical',
        enforcement_action: 'block',
        message: `Intake policy check unavailable (${error.message}). Invoice blocked until enforcement is verified.`,
      }],
      blocked: true,
      error: error.message,
      summary: { vendor_violations: 0, spec_violations: 1, total: 1, highest_severity: 'critical' },
    };
  }

  if (!rawViolations || rawViolations.length === 0) {
    return {
      violations: [],
      blocked: false,
      summary: { vendor_violations: 0, spec_violations: 0, total: 0, highest_severity: 'info' },
    };
  }

  // Map raw violations through settings to determine enforcement actions
  const violations: IntakePolicyViolation[] = [];
  let vendorCount = 0;
  let specCount = 0;
  let highestSeverity: 'info' | 'warning' | 'critical' = 'info';

  for (const raw of rawViolations) {
    const isVendor = raw.violation_type === 'non_preferred_vendor';
    const isSpec = raw.violation_type === 'spec_mismatch' || raw.violation_type === 'spec_missing';

    // Filter spec violations to only enforced fields
    if (isSpec && raw.field_name && !settings.intake_spec_fields.includes(raw.field_name)) continue;

    // Determine enforcement action from settings
    const enforcement = isVendor
      ? settings.intake_vendor_enforcement
      : settings.intake_spec_enforcement;

    const enforcementAction: 'warn' | 'block' = enforcement === 'block' ? 'block' : 'warn';

    const violation: IntakePolicyViolation = {
      invoice_line_id: raw.invoice_line_id,
      item_id: raw.item_id,
      vendor_id: raw.vendor_id,
      violation_type: raw.violation_type,
      severity: raw.severity,
      enforcement_action: enforcementAction,
      field_name: raw.field_name || undefined,
      expected_value: raw.expected_value || undefined,
      actual_value: raw.actual_value || undefined,
      message: raw.message,
    };

    violations.push(violation);

    if (isVendor) vendorCount++;
    if (isSpec) specCount++;

    // Track highest severity
    if (raw.severity === 'critical') highestSeverity = 'critical';
    else if (raw.severity === 'warning' && highestSeverity !== 'critical') highestSeverity = 'warning';
  }

  const blocked = violations.some((v) => v.enforcement_action === 'block');

  return {
    violations,
    blocked,
    summary: {
      vendor_violations: vendorCount,
      spec_violations: specCount,
      total: violations.length,
      highest_severity: highestSeverity,
    },
  };
}

// ── Record ─────────────────────────────────────────────────────

/**
 * Persist intake policy violations to the database.
 * Creates both line-level violations and unified control plane entries.
 */
export async function recordIntakePolicyViolations(
  result: IntakePolicyResult,
  invoiceId: string,
  orgId: string,
  venueId: string | null
): Promise<void> {
  if (result.violations.length === 0) return;

  const supabase = getServiceClient();

  // 1. Insert into intake_policy_violations
  const rows = result.violations.map((v) => ({
    org_id: orgId,
    venue_id: venueId,
    invoice_id: invoiceId,
    invoice_line_id: v.invoice_line_id || null,
    violation_type: v.violation_type,
    severity: v.severity,
    enforcement_action: v.enforcement_action,
    item_id: v.item_id,
    vendor_id: v.vendor_id || null,
    field_name: v.field_name || null,
    expected_value: v.expected_value || null,
    actual_value: v.actual_value || null,
    message: v.message,
    resolved: false,
  }));

  const { error: insertError } = await (supabase as any)
    .from('intake_policy_violations')
    .insert(rows);

  if (insertError) {
    console.error('[IntakePolicy] Failed to record violations:', insertError.message);
    return;
  }

  // 2. Create a single unified control_plane_violations entry
  //    (one per invoice, not per line — keeps Action Center manageable)
  const businessDate = new Date().toISOString().split('T')[0];
  const title = buildViolationTitle(result);

  const { error: cpError } = await (supabase as any)
    .from('control_plane_violations')
    .insert({
      org_id: orgId,
      venue_id: venueId,
      violation_type: 'intake_policy',
      severity: result.summary.highest_severity,
      title,
      description: buildViolationDescription(result),
      metadata: {
        invoice_id: invoiceId,
        vendor_violations: result.summary.vendor_violations,
        spec_violations: result.summary.spec_violations,
        blocked: result.blocked,
      },
      source_table: 'invoices',
      source_id: invoiceId,
      business_date: businessDate,
      status: 'open',
      verification_required: result.blocked,
      escalation_level: 0,
      recurrence_count: 0,
    });

  if (cpError) {
    console.error('[IntakePolicy] Failed to create control plane violation:', cpError.message);
  }
}

// ── Resolve / Override ─────────────────────────────────────────

/**
 * Resolve an intake policy violation (manager override).
 *
 * Requires:
 *   - userId must have the required override role (verified here)
 *   - overrideReason must be non-empty
 *   - Creates a control_plane_violations entry recording the override
 */
export async function resolveIntakeViolation(
  violationId: string,
  userId: string,
  overrideReason: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  if (!overrideReason || overrideReason.trim().length === 0) {
    return { success: false, error: 'Override reason is required' };
  }

  const supabase = getServiceClient();

  // 1. Fetch the violation to verify it exists and get context
  const { data: violation, error: fetchError } = await (supabase as any)
    .from('intake_policy_violations')
    .select('*, invoices:invoice_id(venue_id)')
    .eq('id', violationId)
    .single();

  if (fetchError || !violation) {
    return { success: false, error: 'Violation not found' };
  }

  if (violation.resolved) {
    return { success: false, error: 'Violation already resolved' };
  }

  // 2. Verify authority — check user role against required override role
  //    Fetch org settings to get the configured override role
  const { data: settings } = await (supabase as any)
    .from('procurement_settings')
    .select('intake_override_role')
    .eq('org_id', violation.org_id)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const requiredRole = settings?.intake_override_role || 'admin';
  const authorizedRoles = requiredRole === 'owner' ? ['owner'] : ['admin', 'owner'];

  if (!authorizedRoles.includes(userRole)) {
    return {
      success: false,
      error: `Override requires ${requiredRole} role. Your role: ${userRole}`,
    };
  }

  // 3. Mark violation as resolved
  const { error } = await (supabase as any)
    .from('intake_policy_violations')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      override_reason: overrideReason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', violationId);

  if (error) return { success: false, error: error.message };

  // 4. Escalate to control plane — record the override as an auditable event
  const businessDate = new Date().toISOString().split('T')[0];
  await (supabase as any)
    .from('control_plane_violations')
    .insert({
      org_id: violation.org_id,
      venue_id: violation.invoices?.venue_id || violation.venue_id,
      violation_type: 'intake_policy',
      severity: 'warning',
      title: `Intake policy override: ${violation.violation_type}`,
      description: `Override by ${userRole} (${userId}): "${overrideReason.trim()}". Original violation: ${violation.message}`,
      metadata: {
        override: true,
        original_violation_id: violationId,
        original_violation_type: violation.violation_type,
        override_by: userId,
        override_role: userRole,
        override_reason: overrideReason.trim(),
        invoice_id: violation.invoice_id,
      },
      source_table: 'intake_policy_violations',
      source_id: violationId,
      business_date: businessDate,
      status: 'open',
      verification_required: false,
      escalation_level: 0,
      recurrence_count: 0,
    });

  return { success: true };
}

// ── Query ──────────────────────────────────────────────────────

/**
 * Get all intake policy violations for an invoice.
 */
export async function getViolationsForInvoice(
  invoiceId: string
): Promise<(IntakePolicyViolation & { id: string; resolved: boolean; override_reason?: string })[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('intake_policy_violations')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[IntakePolicy] Failed to fetch violations:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Check if an invoice has unresolved block-severity violations.
 *
 * FAIL CLOSED: If the query errors, assume blocked.
 */
export async function hasUnresolvedBlocks(invoiceId: string): Promise<{
  blocked: boolean;
  count: number;
  violations: { id: string; message: string; violation_type: string }[];
}> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('intake_policy_violations')
    .select('id, message, violation_type')
    .eq('invoice_id', invoiceId)
    .eq('enforcement_action', 'block')
    .eq('resolved', false);

  // FAIL CLOSED: if we can't check, assume blocked
  if (error) {
    console.error('[IntakePolicy] Failed to check blocks — failing closed:', error.message);
    return {
      blocked: true,
      count: 1,
      violations: [{ id: '', message: 'Unable to verify intake policy status. Approval blocked.', violation_type: 'spec_missing' }],
    };
  }

  return {
    blocked: (data?.length || 0) > 0,
    count: data?.length || 0,
    violations: data || [],
  };
}

// ── Helpers ────────────────────────────────────────────────────

function buildViolationTitle(result: IntakePolicyResult): string {
  const parts: string[] = [];
  if (result.summary.vendor_violations > 0) {
    parts.push(`${result.summary.vendor_violations} non-preferred vendor${result.summary.vendor_violations > 1 ? 's' : ''}`);
  }
  if (result.summary.spec_violations > 0) {
    parts.push(`${result.summary.spec_violations} spec mismatch${result.summary.spec_violations > 1 ? 'es' : ''}`);
  }
  const action = result.blocked ? 'BLOCKED' : 'Warning';
  return `Intake ${action}: ${parts.join(', ')}`;
}

function buildViolationDescription(result: IntakePolicyResult): string {
  const lines = result.violations.slice(0, 5).map((v) => `- ${v.message}`);
  if (result.violations.length > 5) {
    lines.push(`- ...and ${result.violations.length - 5} more`);
  }
  return lines.join('\n');
}
