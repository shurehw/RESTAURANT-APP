/**
 * Escalation Ladder — Time-Based + Recurrence + Cross-Venue + Silence + Stall
 *
 * Five escalation mechanisms:
 * A. Time-based: unresolved violations escalate upward on a schedule
 * B. Recurrence-based: repeated violations of the same type get severity bumps
 * C. Cross-venue systemic: same violation type across 3+ venues = org-level flag
 * D. Silence penalty: unacknowledged violations past threshold get severity bumps
 * E. Stall detection: acknowledged but no action past threshold get escalated
 *
 * Called nightly after violations are created by the enforcement cron.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { insertEscalationEvent } from '@/lib/enforcement/state-machine';

// ============================================================================
// Constants
// ============================================================================

/** Time-based escalation thresholds (hours since detected_at) */
const TIME_ESCALATION = {
  // Critical violations
  critical: [
    { from: 0, to: 1, hoursThreshold: 24 },   // L0 → L1 (GM) after 24h
    { from: 1, to: 2, hoursThreshold: 48 },   // L1 → L2 (Director) after 48h from L1
    { from: 2, to: 3, hoursThreshold: 72 },   // L2 → L3 (Owner) after 72h from L2
  ],
  // Warning violations
  warning: [
    { from: 0, to: 1, hoursThreshold: 72 },   // L0 → L1 (GM) after 72h
    { from: 1, to: 2, hoursThreshold: 120 },  // L1 → L2 (Director) after 120h from L1
  ],
} as const;

/** Recurrence thresholds */
const RECURRENCE = {
  /** 3+ of same type at same venue in 14 days → severity bump + L1 */
  sampled_threshold: 3,
  sampled_window_days: 14,
  /** 2+ critical of same type at same venue in 7 days → L2 structural */
  critical_threshold: 2,
  critical_window_days: 7,
} as const;

/** Cross-venue systemic threshold */
const CROSS_VENUE = {
  /** Same violation_type across N+ venues in the org within 14 days */
  venue_threshold: 3,
  window_days: 14,
} as const;

/** Silence penalty thresholds — violation still in 'open' status */
const SILENCE = {
  critical_hours: 4,    // Critical: 4h unacknowledged → severity bump + escalation
  warning_hours: 12,    // Warning: 12h unacknowledged → severity bump + escalation
} as const;

/** Stall detection thresholds — 'acknowledged' but no action submitted */
const STALL = {
  critical_hours: 24,   // Critical: 24h acknowledged with no action → escalation
  warning_hours: 48,    // Warning: 48h acknowledged with no action → escalation
} as const;

// ============================================================================
// Main Entry
// ============================================================================

export interface EscalationResult {
  time_escalated: number;
  recurrence_flagged: number;
  systemic_flagged: number;
  silence_penalized: number;
  stall_penalized: number;
  errors: string[];
}

/**
 * Run the full escalation ladder for an organization.
 * Called nightly after violations are created.
 */
export async function runEscalationLadder(orgId: string): Promise<EscalationResult> {
  const result: EscalationResult = {
    time_escalated: 0,
    recurrence_flagged: 0,
    systemic_flagged: 0,
    silence_penalized: 0,
    stall_penalized: 0,
    errors: [],
  };

  const supabase = getServiceClient() as any;

  try {
    // A. Time-based escalation
    const timeResult = await runTimeEscalation(supabase, orgId);
    result.time_escalated = timeResult.count;
    result.errors.push(...timeResult.errors);
  } catch (err: any) {
    result.errors.push(`Time escalation failed: ${err.message}`);
  }

  try {
    // B. Recurrence-based escalation
    const recurrenceResult = await runRecurrenceEscalation(supabase, orgId);
    result.recurrence_flagged = recurrenceResult.count;
    result.errors.push(...recurrenceResult.errors);
  } catch (err: any) {
    result.errors.push(`Recurrence escalation failed: ${err.message}`);
  }

  try {
    // C. Cross-venue systemic detection
    const systemicResult = await runCrossVenueDetection(supabase, orgId);
    result.systemic_flagged = systemicResult.count;
    result.errors.push(...systemicResult.errors);
  } catch (err: any) {
    result.errors.push(`Cross-venue detection failed: ${err.message}`);
  }

  try {
    // D. Silence penalty
    const silenceResult = await runSilencePenalty(supabase, orgId);
    result.silence_penalized = silenceResult.count;
    result.errors.push(...silenceResult.errors);
  } catch (err: any) {
    result.errors.push(`Silence penalty failed: ${err.message}`);
  }

  try {
    // E. Stall detection
    const stallResult = await runStallDetection(supabase, orgId);
    result.stall_penalized = stallResult.count;
    result.errors.push(...stallResult.errors);
  } catch (err: any) {
    result.errors.push(`Stall detection failed: ${err.message}`);
  }

  return result;
}

// ============================================================================
// A. Time-Based Escalation
// ============================================================================

async function runTimeEscalation(
  supabase: any,
  orgId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Fetch all active (non-terminal) violations for this org
  const { data: violations, error } = await supabase
    .from('control_plane_violations')
    .select('id, violation_type, severity, escalation_level, detected_at, escalated_at, venue_id, status')
    .eq('org_id', orgId)
    .not('status', 'in', '(resolved,waived)')
    .order('detected_at', { ascending: true });

  if (error) {
    errors.push(`Failed to fetch violations: ${error.message}`);
    return { count, errors };
  }

  if (!violations || violations.length === 0) return { count, errors };

  const now = new Date();

  for (const v of violations) {
    const thresholds = v.severity === 'critical'
      ? TIME_ESCALATION.critical
      : v.severity === 'warning'
        ? TIME_ESCALATION.warning
        : [];

    const currentLevel = v.escalation_level || 0;
    const rule = thresholds.find(t => t.from === currentLevel);
    if (!rule) continue; // Already at max level for this severity

    // Calculate hours since the relevant timestamp
    // If previously escalated, measure from escalated_at; otherwise from detected_at
    const referenceTime = v.escalated_at
      ? new Date(v.escalated_at)
      : new Date(v.detected_at);
    const hoursSince = (now.getTime() - referenceTime.getTime()) / (1000 * 60 * 60);

    if (hoursSince >= rule.hoursThreshold) {
      try {
        // Bump escalation level
        const { error: updateError } = await supabase
          .from('control_plane_violations')
          .update({
            escalation_level: rule.to,
            escalated_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', v.id);

        if (updateError) {
          errors.push(`Failed to escalate ${v.id}: ${updateError.message}`);
          continue;
        }

        // Create escalation action
        await supabase
          .from('control_plane_actions')
          .insert({
            violation_id: v.id,
            action_type: 'escalate',
            action_target: getEscalationTarget(rule.to),
            message: `Violation escalated to Level ${rule.to} — unresolved for ${Math.floor(hoursSince)}h`,
            action_data: {
              previous_level: rule.from,
              new_level: rule.to,
              hours_unresolved: Math.floor(hoursSince),
              threshold_hours: rule.hoursThreshold,
            },
            scheduled_for: now.toISOString(),
            execution_status: 'pending',
          });

        // Record escalation event
        await insertEscalationEvent(supabase, v.id, 'escalated', {
          previous_level: rule.from,
          new_level: rule.to,
          hours_unresolved: Math.floor(hoursSince),
          trigger: 'time_based',
        });

        count++;
      } catch (err: any) {
        errors.push(`Escalation action failed for ${v.id}: ${err.message}`);
      }
    }
  }

  return { count, errors };
}

/** Map escalation level to target role */
function getEscalationTarget(level: number): string {
  switch (level) {
    case 1: return 'gm';
    case 2: return 'director';
    case 3: return 'owner';
    default: return 'manager';
  }
}

// ============================================================================
// B. Recurrence-Based Escalation
// ============================================================================

interface RecurrenceViolation {
  id: string;
  venue_id: string;
  violation_type: string;
  severity: string;
  business_date: string;
  recurrence_count: number;
  escalation_level?: number;
}

async function runRecurrenceEscalation(
  supabase: any,
  orgId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const now = new Date();
  const windowStart14d = new Date(now);
  windowStart14d.setDate(windowStart14d.getDate() - RECURRENCE.sampled_window_days);
  const windowStart7d = new Date(now);
  windowStart7d.setDate(windowStart7d.getDate() - RECURRENCE.critical_window_days);

  // Get recent violations grouped by venue + type (14-day window)
  const { data: recent, error } = await supabase
    .from('control_plane_violations')
    .select('id, venue_id, violation_type, severity, business_date, recurrence_count, escalation_level')
    .eq('org_id', orgId)
    .gte('detected_at', windowStart14d.toISOString())
    .not('venue_id', 'is', null);

  if (error) {
    errors.push(`Failed to fetch recent violations: ${error.message}`);
    return { count, errors };
  }

  if (!recent || recent.length === 0) return { count, errors };

  // Group by venue_id + violation_type
  const groups = new Map<string, RecurrenceViolation[]>();
  for (const v of recent as RecurrenceViolation[]) {
    const key = `${v.venue_id}::${v.violation_type}`;
    const arr = groups.get(key) || [];
    arr.push(v);
    groups.set(key, arr);
  }

  for (const [key, violations] of groups) {
    // Check 1: 3+ violations of same type at same venue in 14 days
    if (violations.length >= RECURRENCE.sampled_threshold) {
      // Only flag if not already recurrence-flagged
      const alreadyFlagged = violations.some(v => (v.recurrence_count || 0) >= violations.length);
      if (!alreadyFlagged) {
        const [venueId, violationType] = key.split('::');
        try {
          // Update the most recent violation with recurrence count
          const latest = violations.sort(
            (a: any, b: any) => new Date(b.business_date).getTime() - new Date(a.business_date).getTime()
          )[0];

          // If it was a warning, bump to critical
          const newSeverity = latest.severity === 'warning' ? 'critical' : latest.severity;
          const newLevel = Math.max(latest.escalation_level || 0, 1);

          await supabase
            .from('control_plane_violations')
            .update({
              severity: newSeverity,
              escalation_level: newLevel,
              recurrence_count: violations.length,
              escalated_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', latest.id);

          // Create recurrence action
          await supabase
            .from('control_plane_actions')
            .insert({
              violation_id: latest.id,
              action_type: 'escalate',
              action_target: 'gm',
              message: `Recurring ${violationType}: ${violations.length} occurrences in ${RECURRENCE.sampled_window_days} days`,
              action_data: {
                recurrence_type: 'same_venue_same_type',
                occurrence_count: violations.length,
                window_days: RECURRENCE.sampled_window_days,
                venue_id: venueId,
              },
              scheduled_for: now.toISOString(),
              execution_status: 'pending',
            });

          // Record event
          await insertEscalationEvent(supabase, latest.id, 'escalated', {
            trigger: 'recurrence',
            occurrence_count: violations.length,
            window_days: RECURRENCE.sampled_window_days,
          });

          count++;
        } catch (err: any) {
          errors.push(`Recurrence flag failed for ${key}: ${err.message}`);
        }
      }
    }

    // Check 2: 2+ critical of same type in 7 days → L2 structural
    const criticals7d = violations.filter(
      v => v.severity === 'critical' && new Date(v.business_date) >= windowStart7d
    );
    if (criticals7d.length >= RECURRENCE.critical_threshold) {
      const latest = criticals7d.sort(
        (a: any, b: any) => new Date(b.business_date).getTime() - new Date(a.business_date).getTime()
      )[0];
      const currentLevel = latest.escalation_level || 0;
      if (currentLevel < 2) {
        try {
          await supabase
            .from('control_plane_violations')
            .update({
              escalation_level: 2,
              recurrence_count: criticals7d.length,
              escalated_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', latest.id);

          await supabase
            .from('control_plane_actions')
            .insert({
              violation_id: latest.id,
              action_type: 'escalate',
              action_target: 'director',
              message: `Structural: ${criticals7d.length} critical ${latest.violation_type} violations in ${RECURRENCE.critical_window_days} days`,
              action_data: {
                recurrence_type: 'structural_critical',
                occurrence_count: criticals7d.length,
                window_days: RECURRENCE.critical_window_days,
              },
              scheduled_for: now.toISOString(),
              execution_status: 'pending',
            });

          await insertEscalationEvent(supabase, latest.id, 'escalated', {
            trigger: 'structural_critical',
            occurrence_count: criticals7d.length,
            window_days: RECURRENCE.critical_window_days,
          });

          count++;
        } catch (err: any) {
          errors.push(`Structural escalation failed for ${key}: ${err.message}`);
        }
      }
    }
  }

  return { count, errors };
}

// ============================================================================
// C. Cross-Venue Systemic Detection
// ============================================================================

async function runCrossVenueDetection(
  supabase: any,
  orgId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - CROSS_VENUE.window_days);

  // Get violations in window, grouped by type
  const { data: recent, error } = await supabase
    .from('control_plane_violations')
    .select('id, venue_id, violation_type, severity, business_date')
    .eq('org_id', orgId)
    .gte('detected_at', windowStart.toISOString())
    .not('venue_id', 'is', null);

  if (error) {
    errors.push(`Failed to fetch violations for cross-venue: ${error.message}`);
    return { count, errors };
  }

  if (!recent || recent.length === 0) return { count, errors };

  // Group by violation_type → distinct venue_ids
  const typeVenues = new Map<string, Set<string>>();
  for (const v of recent) {
    const set = typeVenues.get(v.violation_type) || new Set<string>();
    set.add(v.venue_id);
    typeVenues.set(v.violation_type, set);
  }

  for (const [violationType, venueIds] of typeVenues) {
    if (venueIds.size >= CROSS_VENUE.venue_threshold) {
      // Check if we already created a systemic violation for this type recently
      const { data: existing } = await supabase
        .from('control_plane_violations')
        .select('id')
        .eq('org_id', orgId)
        .like('title', `Systemic: ${violationType}%`)
        .gte('detected_at', windowStart.toISOString())
        .is('venue_id', null)
        .limit(1);

      if (existing && existing.length > 0) continue; // Already flagged

      try {
        const today = now.toISOString().split('T')[0];

        const { data: systemicViolation, error: insertError } = await supabase
          .from('control_plane_violations')
          .insert({
            org_id: orgId,
            venue_id: null, // Org-level
            violation_type: violationType,
            severity: 'critical',
            title: `Systemic: ${violationType} across ${venueIds.size} venues`,
            description: `${violationType} violations detected at ${venueIds.size} venues in the last ${CROSS_VENUE.window_days} days. This indicates a systemic issue requiring org-level review.`,
            metadata: {
              systemic: true,
              venue_count: venueIds.size,
              venue_ids: Array.from(venueIds),
              window_days: CROSS_VENUE.window_days,
            },
            source_table: 'control_plane_violations',
            source_id: `systemic_${violationType}_${today}`,
            business_date: today,
            status: 'open',
            verification_required: true,
            escalation_level: 2,
            recurrence_count: 0,
          })
          .select()
          .single();

        if (insertError) {
          errors.push(`Failed to create systemic violation: ${insertError.message}`);
          continue;
        }

        // Insert created event for the systemic violation
        await supabase.from('violation_events').insert({
          violation_id: systemicViolation.id,
          event_type: 'created',
          to_status: 'open',
          occurred_at: now.toISOString(),
          metadata: { systemic: true, venue_count: venueIds.size },
        });

        // Create director-level action
        await supabase
          .from('control_plane_actions')
          .insert({
            violation_id: systemicViolation.id,
            action_type: 'escalate',
            action_target: 'director',
            message: `Systemic ${violationType} detected across ${venueIds.size} venues — org-level review required`,
            action_data: {
              systemic: true,
              violation_type: violationType,
              venue_count: venueIds.size,
              venue_ids: Array.from(venueIds),
            },
            scheduled_for: now.toISOString(),
            execution_status: 'pending',
          });

        count++;
      } catch (err: any) {
        errors.push(`Systemic violation creation failed for ${violationType}: ${err.message}`);
      }
    }
  }

  return { count, errors };
}

// ============================================================================
// D. Silence Penalty — Unacknowledged violations past threshold
// ============================================================================

async function runSilencePenalty(
  supabase: any,
  orgId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Fetch violations still in 'open' status (never acknowledged)
  const { data: openViolations, error } = await supabase
    .from('control_plane_violations')
    .select('id, severity, detected_at, escalation_level')
    .eq('org_id', orgId)
    .eq('status', 'open')
    .order('detected_at', { ascending: true });

  if (error) {
    errors.push(`Failed to fetch open violations for silence check: ${error.message}`);
    return { count, errors };
  }

  if (!openViolations || openViolations.length === 0) return { count, errors };

  const now = new Date();

  for (const v of openViolations) {
    const hoursSinceDetected = (now.getTime() - new Date(v.detected_at).getTime()) / (1000 * 60 * 60);

    const threshold = v.severity === 'critical'
      ? SILENCE.critical_hours
      : v.severity === 'warning'
        ? SILENCE.warning_hours
        : null;

    if (!threshold || hoursSinceDetected < threshold) continue;

    try {
      // Severity bump: warning → critical
      const newSeverity = v.severity === 'warning' ? 'critical' : v.severity;
      const newLevel = (v.escalation_level || 0) + 1;

      const { error: updateError } = await supabase
        .from('control_plane_violations')
        .update({
          severity: newSeverity,
          escalation_level: newLevel,
          verification_required: newSeverity === 'critical' ? true : undefined,
          escalated_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', v.id)
        .eq('status', 'open'); // Optimistic concurrency

      if (updateError) {
        errors.push(`Silence penalty update failed for ${v.id}: ${updateError.message}`);
        continue;
      }

      // Create escalation action
      await supabase
        .from('control_plane_actions')
        .insert({
          violation_id: v.id,
          action_type: 'escalate',
          action_target: getEscalationTarget(newLevel),
          message: `Silence penalty: violation unacknowledged for ${Math.floor(hoursSinceDetected)}h — escalated to L${newLevel}`,
          action_data: {
            penalty_type: 'silence',
            hours_unacknowledged: Math.floor(hoursSinceDetected),
            threshold_hours: threshold,
            previous_severity: v.severity,
            new_severity: newSeverity,
          },
          scheduled_for: now.toISOString(),
          execution_status: 'pending',
        });

      // Record silence penalty event
      await insertEscalationEvent(supabase, v.id, 'silence_penalty', {
        hours_unacknowledged: Math.floor(hoursSinceDetected),
        threshold_hours: threshold,
        severity_bumped: v.severity !== newSeverity,
        new_level: newLevel,
      });

      count++;
    } catch (err: any) {
      errors.push(`Silence penalty failed for ${v.id}: ${err.message}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// E. Stall Detection — Acknowledged but no action submitted
// ============================================================================

async function runStallDetection(
  supabase: any,
  orgId: string,
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Fetch violations in 'acknowledged' status with no action_at
  const { data: stalledViolations, error } = await supabase
    .from('control_plane_violations')
    .select('id, severity, ack_at, escalation_level')
    .eq('org_id', orgId)
    .eq('status', 'acknowledged')
    .is('action_at', null)
    .order('ack_at', { ascending: true });

  if (error) {
    errors.push(`Failed to fetch stalled violations: ${error.message}`);
    return { count, errors };
  }

  if (!stalledViolations || stalledViolations.length === 0) return { count, errors };

  const now = new Date();

  for (const v of stalledViolations) {
    if (!v.ack_at) continue;

    const hoursSinceAck = (now.getTime() - new Date(v.ack_at).getTime()) / (1000 * 60 * 60);

    const threshold = v.severity === 'critical'
      ? STALL.critical_hours
      : v.severity === 'warning'
        ? STALL.warning_hours
        : null;

    if (!threshold || hoursSinceAck < threshold) continue;

    try {
      const newLevel = (v.escalation_level || 0) + 1;

      const { error: updateError } = await supabase
        .from('control_plane_violations')
        .update({
          escalation_level: newLevel,
          escalated_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', v.id)
        .eq('status', 'acknowledged'); // Optimistic concurrency

      if (updateError) {
        errors.push(`Stall detection update failed for ${v.id}: ${updateError.message}`);
        continue;
      }

      // Create escalation action
      await supabase
        .from('control_plane_actions')
        .insert({
          violation_id: v.id,
          action_type: 'escalate',
          action_target: getEscalationTarget(newLevel),
          message: `Stall detected: acknowledged ${Math.floor(hoursSinceAck)}h ago with no corrective action — escalated to L${newLevel}`,
          action_data: {
            penalty_type: 'stall',
            hours_since_ack: Math.floor(hoursSinceAck),
            threshold_hours: threshold,
          },
          scheduled_for: now.toISOString(),
          execution_status: 'pending',
        });

      // Record stall penalty event
      await insertEscalationEvent(supabase, v.id, 'stall_penalty', {
        hours_since_ack: Math.floor(hoursSinceAck),
        threshold_hours: threshold,
        new_level: newLevel,
      });

      count++;
    } catch (err: any) {
      errors.push(`Stall detection failed for ${v.id}: ${err.message}`);
    }
  }

  return { count, errors };
}
