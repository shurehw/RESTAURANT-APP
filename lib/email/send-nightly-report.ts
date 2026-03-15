/**
 * lib/email/send-nightly-report.ts
 * Orchestrates rendering and sending nightly report emails.
 */

import { getResendClient, FROM_EMAIL } from './resend';
import { renderNightlyReportEmail, type VenueReport } from './nightly-report-template';
import {
  getActiveSubscribers,
  resolveSubscriberVenues,
  type NightlySubscriber,
  type OrgVenue,
} from '@/lib/database/nightly-subscribers';
import type { NightlyReportData } from '@/lib/database/tipsee';

// ── Types ────────────────────────────────────────────────────────

interface SendForOrgParams {
  orgId: string;
  orgName: string;
  logoUrl: string | null;
  businessDate: string;
  orgVenues: OrgVenue[];
  reportCache: Map<string, NightlyReportData>;
  laborCache: Map<string, VenueReport['laborData']>;
  aiSummaries?: Map<string, string>;
}

interface SendResult {
  sent: number;
  failed: number;
  errors: string[];
}

// ── Core ─────────────────────────────────────────────────────────

/**
 * Send nightly report emails for a single organization.
 * Groups subscribers by scope, renders HTML, sends via Resend.
 */
export async function sendNightlyReportForOrg(
  params: SendForOrgParams
): Promise<SendResult> {
  const { orgId, orgName, logoUrl, businessDate, orgVenues, reportCache, laborCache, aiSummaries } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kevaos.ai';
  const resend = getResendClient();

  const subscribers = await getActiveSubscribers(orgId);
  if (subscribers.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process each subscriber
  const results = await Promise.allSettled(
    subscribers.map(async (sub) => {
      try {
        return await sendToSubscriber({
          subscriber: sub,
          orgName,
          logoUrl,
          businessDate,
          orgVenues,
          reportCache,
          laborCache,
          aiSummaries,
          appUrl,
          resend,
        });
      } catch (err: any) {
        throw new Error(`${sub.email}: ${err.message}`);
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      sent++;
    } else if (result.status === 'rejected') {
      failed++;
      errors.push(result.reason?.message || 'Unknown error');
    }
  }

  return { sent, failed, errors };
}

// ── Per-Subscriber Sender ────────────────────────────────────────

async function sendToSubscriber(params: {
  subscriber: NightlySubscriber;
  orgName: string;
  logoUrl: string | null;
  businessDate: string;
  orgVenues: OrgVenue[];
  reportCache: Map<string, NightlyReportData>;
  laborCache: Map<string, VenueReport['laborData']>;
  aiSummaries?: Map<string, string>;
  appUrl: string;
  resend: ReturnType<typeof getResendClient>;
}): Promise<boolean> {
  const { subscriber, orgName, logoUrl, businessDate, orgVenues, reportCache, laborCache, aiSummaries, appUrl, resend } = params;

  // Resolve which venues this subscriber should see
  const { venues, isConsolidated } = await resolveSubscriberVenues(subscriber, orgVenues);

  if (venues.length === 0) return false;

  // Build venue report data
  const venueReports: VenueReport[] = [];
  for (const venue of venues) {
    const report = reportCache.get(venue.id);
    if (!report) continue; // Skip venues with no data (closed/sync failed)

    venueReports.push({
      venueName: venue.name,
      venueId: venue.id,
      report,
      laborData: laborCache.get(venue.id) || null,
    });
  }

  if (venueReports.length === 0) return false;

  // Render email
  const html = renderNightlyReportEmail({
    orgName,
    businessDate,
    venues: venueReports,
    appUrl,
    logoUrl,
    aiSummaries,
  });

  // Build subject line
  const subject = isConsolidated
    ? `${orgName} — Nightly Report — ${businessDate}`
    : `${venueReports[0].venueName} — Nightly Report — ${businessDate}`;

  // Send via Resend
  const { error } = await resend.emails.send({
    from: `KevaOS Reports <${FROM_EMAIL}>`,
    to: subscriber.email,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}
