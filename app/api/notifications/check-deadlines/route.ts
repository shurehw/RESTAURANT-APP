/**
 * Attestation Deadline Checker
 *
 * GET /api/notifications/check-deadlines
 *
 * Called by external scheduler every 30 minutes.
 * Checks for attestation deadlines and sends notifications:
 *   - attestation_reminder: within 1 hour of deadline, no submission
 *   - attestation_late: past deadline, no submission
 *
 * Deduplicates by checking enforcement_notifications to avoid resending.
 *
 * Auth: x-cron-secret header or Bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { broadcastNotification } from '@/lib/notifications/dispatcher';

const CRON_SECRET = process.env.CRON_SECRET;
const ATTESTATION_DUE_HOUR = 14; // 2pm local time
const REMINDER_WINDOW_MS = 60 * 60 * 1000; // 1 hour before deadline

export async function GET(request: NextRequest) {
  // Auth check
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getServiceClient();

  try {
    // 1. Fetch all active venues with org and timezone
    const { data: venues, error: venueErr } = await (supabase as any)
      .from('venues')
      .select('id, name, organization_id, timezone')
      .eq('is_active', true);

    if (venueErr) {
      throw new Error(`Failed to fetch venues: ${venueErr.message}`);
    }

    if (!venues || venues.length === 0) {
      return NextResponse.json({
        success: true,
        duration_ms: Date.now() - start,
        venues_checked: 0,
        reminders_sent: 0,
        late_sent: 0,
      });
    }

    // 2. Compute today's business date (what we're checking attestations for)
    const now = new Date();
    const businessDate = computeBusinessDate(now);

    let remindersSent = 0;
    let lateSent = 0;
    const errors: string[] = [];

    // 3. Process each venue
    for (const venue of venues) {
      try {
        const tz = venue.timezone || 'America/Los_Angeles';
        const dueAt = computeDueDate(businessDate, tz);
        const reminderStart = new Date(dueAt.getTime() - REMINDER_WINDOW_MS);

        // Check if attestation exists and is submitted
        const { data: attestation } = await (supabase as any)
          .from('nightly_attestations')
          .select('id, status')
          .eq('venue_id', venue.id)
          .eq('business_date', businessDate)
          .maybeSingle();

        const isSubmitted =
          attestation?.status === 'submitted' || attestation?.status === 'amended';

        if (isSubmitted) continue; // Already submitted, skip

        // Within reminder window (1h before deadline)?
        if (now >= reminderStart && now < dueAt) {
          const alreadySent = await wasNotificationSent(
            venue.id,
            'attestation_reminder',
            businessDate
          );
          if (!alreadySent) {
            const result = await broadcastNotification({
              orgId: venue.organization_id,
              venueId: venue.id,
              targetRole: 'venue_manager',
              type: 'attestation_reminder',
              severity: 'warning',
              title: `Attestation Due Soon — ${venue.name}`,
              body: `Nightly attestation for ${businessDate} is due by ${formatTime(dueAt, tz)}. Please complete the preshift briefing and submit.`,
              actionUrl: `/preshift?venue_id=${venue.id}`,
              sourceTable: 'nightly_attestation',
              sourceId: attestation?.id || undefined,
            });
            remindersSent += result.sent;
            errors.push(...result.errors);
          }
        }

        // Past deadline?
        if (now >= dueAt) {
          const alreadySent = await wasNotificationSent(
            venue.id,
            'attestation_late',
            businessDate
          );
          if (!alreadySent) {
            const result = await broadcastNotification({
              orgId: venue.organization_id,
              venueId: venue.id,
              targetRole: 'venue_manager',
              type: 'attestation_late',
              severity: 'critical',
              title: `Attestation OVERDUE — ${venue.name}`,
              body: `Nightly attestation for ${businessDate} was due at ${formatTime(dueAt, tz)} and has not been submitted. This is a compliance violation.`,
              actionUrl: `/preshift?venue_id=${venue.id}`,
              sourceTable: 'nightly_attestation',
              sourceId: attestation?.id || undefined,
            });
            lateSent += result.sent;
            errors.push(...result.errors);

            // Also notify GM/corporate for late attestations
            const escalationResult = await broadcastNotification({
              orgId: venue.organization_id,
              venueId: venue.id,
              targetRole: 'gm',
              type: 'attestation_late',
              severity: 'critical',
              title: `Attestation OVERDUE — ${venue.name}`,
              body: `The nightly attestation for ${venue.name} (${businessDate}) has not been submitted past the deadline. Manager has been notified.`,
              actionUrl: `/attestations`,
            });
            lateSent += escalationResult.sent;
            errors.push(...escalationResult.errors);
          }
        }
      } catch (err: any) {
        errors.push(`Venue ${venue.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - start,
      business_date: businessDate,
      venues_checked: venues.length,
      reminders_sent: remindersSent,
      late_sent: lateSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[Check Deadlines] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Internal error',
        duration_ms: Date.now() - start,
      },
      { status: 500 }
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Compute business date. Before 5 AM = yesterday.
 */
function computeBusinessDate(now: Date): string {
  const adjusted = new Date(now);
  if (adjusted.getHours() < 5) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  // Use yesterday as the business date we're checking attestation for
  adjusted.setDate(adjusted.getDate() - 1);
  return adjusted.toISOString().split('T')[0];
}

/**
 * Compute due date for an attestation.
 * Attestation is due at ATTESTATION_DUE_HOUR (2pm) the day after business_date.
 */
function computeDueDate(businessDate: string, timezone: string): Date {
  // Parse business date
  const [year, month, day] = businessDate.split('-').map(Number);

  // Due date = business_date + 1 day at 2pm local time
  // Convert to UTC using timezone offset
  const tzOffset = getTimezoneOffsetHours(timezone);
  const dueDate = new Date(Date.UTC(year, month - 1, day + 1, ATTESTATION_DUE_HOUR - tzOffset, 0, 0));
  return dueDate;
}

/**
 * Get approximate timezone offset in hours from UTC.
 * A full timezone library would be better, but this covers our venues.
 */
function getTimezoneOffsetHours(timezone: string): number {
  const offsets: Record<string, number> = {
    'America/Los_Angeles': -8,
    'America/Denver': -7,
    'America/Chicago': -6,
    'America/New_York': -5,
    'US/Pacific': -8,
    'US/Mountain': -7,
    'US/Central': -6,
    'US/Eastern': -5,
  };
  return offsets[timezone] ?? -8; // Default PST
}

/**
 * Format a Date for display using timezone.
 */
function formatTime(date: Date, timezone: string): string {
  try {
    return date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

/**
 * Check if a notification of this type was already sent for this venue/date.
 * Prevents duplicate notifications on repeated cron calls.
 */
async function wasNotificationSent(
  venueId: string,
  type: string,
  businessDate: string
): Promise<boolean> {
  const supabase = getServiceClient();

  // Look for notifications of this type for this venue created today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await (supabase as any)
    .from('enforcement_notifications')
    .select('id')
    .eq('venue_id', venueId)
    .eq('notification_type', type)
    .gte('created_at', todayStart.toISOString())
    .limit(1);

  return (data || []).length > 0;
}
