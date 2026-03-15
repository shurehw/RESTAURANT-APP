/**
 * Nightly Report Email Cron
 *
 * Sends nightly report emails to subscribed users.
 * Runs at 14:00 UTC (7 AM PT) after ETL (11 UTC), sync-tipsee (12 UTC), and enforce (12:30 UTC).
 *
 * GET /api/cron/nightly-report?date=YYYY-MM-DD (optional override)
 *
 * Per-org processing:
 * 1. Fetch active venues + TipSee mappings
 * 2. Load cached nightly data (from tipsee_nightly_cache)
 * 3. Load labor_day_facts
 * 4. Resolve subscribers + venue scoping
 * 5. Render + send emails via Resend
 * 6. Log to nightly_report_log
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getOrgsWithBriefingEnabled,
  getOrgVenues,
  getVenueTipseeMappings,
  logReportRun,
} from '@/lib/database/nightly-subscribers';
import { fetchNightlyReportFromFacts } from '@/lib/database/tipsee';
import { sendNightlyReportForOrg } from '@/lib/email/send-nightly-report';
import type { NightlyReportData } from '@/lib/database/tipsee';
import type { VenueReport } from '@/lib/email/nightly-report-template';
import { generateVenueSummaries } from '@/lib/ai/nightly-summarizer';
import { fetchManagerDigestEmails } from '@/lib/email/outlook-digest-fetcher';
import {
  parseLightspeedDigest,
  parseWynnShiftReport,
  resolveVenueName,
  extractSubjectDate,
} from '@/lib/email/manager-notes-parser';
import { generateNarrativeFromNotes } from '@/lib/ai/manager-notes-narrator';

// ── Auth ─────────────────────────────────────────────────────────

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

// ── Business Date ────────────────────────────────────────────────

function getYesterday(): string {
  // Get today in Pacific time first, then subtract 1 day
  const todayPT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const d = new Date(todayPT + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ── Handler ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return handleNightlyReport(request);
}

export async function POST(request: NextRequest) {
  return handleNightlyReport(request);
}

async function handleNightlyReport(request: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Determine business date
  const searchParams = request.nextUrl?.searchParams;
  const dateParam = searchParams?.get('date');
  const businessDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getYesterday();

  console.log(`[nightly-report-cron] Starting for ${businessDate}`);

  // Fetch all orgs with briefing enabled
  const orgs = await getOrgsWithBriefingEnabled();
  if (orgs.length === 0) {
    return NextResponse.json({
      success: true,
      businessDate,
      message: 'No orgs with daily briefing enabled',
      duration_ms: Date.now() - t0,
    });
  }

  console.log(`[nightly-report-cron] Processing ${orgs.length} org(s)`);

  // Process each org
  const orgResults = await Promise.allSettled(
    orgs.map(async (org) => {
      const startedAt = new Date();

      try {
        const result = await processOrg(org, businessDate);

        await logReportRun({
          orgId: org.id,
          businessDate,
          sent: result.sent,
          failed: result.failed,
          startedAt,
          error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
          details: { venueCount: result.venueCount },
        });

        return { orgId: org.id, orgName: org.name, ...result };
      } catch (err: any) {
        await logReportRun({
          orgId: org.id,
          businessDate,
          sent: 0,
          failed: 0,
          startedAt,
          error: err.message,
        });
        throw err;
      }
    })
  );

  // Summarize results
  const summary = orgResults.map((r, i) => {
    if (r.status === 'fulfilled') {
      return { org: orgs[i].name, ...r.value };
    }
    return { org: orgs[i].name, error: r.reason?.message || 'Unknown error' };
  });

  return NextResponse.json({
    success: true,
    businessDate,
    orgs: summary,
    duration_ms: Date.now() - t0,
  });
}

// ── Per-Org Processing ───────────────────────────────────────────

async function processOrg(
  org: { id: string; name: string; logo_url: string | null },
  businessDate: string
): Promise<{ sent: number; failed: number; errors: string[]; venueCount: number }> {
  const supabase = getServiceClient();

  // 1. Fetch active venues
  const orgVenues = await getOrgVenues(org.id);
  if (orgVenues.length === 0) {
    return { sent: 0, failed: 0, errors: [], venueCount: 0 };
  }

  const venueIds = orgVenues.map((v) => v.id);

  // 2. Fetch TipSee mappings
  const tipseeMappings = await getVenueTipseeMappings(venueIds);

  // 3. Fetch nightly report data for each venue (cache-first)
  const reportCache = new Map<string, NightlyReportData>();

  await Promise.allSettled(
    orgVenues.map(async (venue) => {
      try {
        const report = await fetchVenueReport(supabase, venue.id, tipseeMappings.get(venue.id), businessDate);
        if (report) {
          reportCache.set(venue.id, report);
        }
      } catch (err: any) {
        console.error(`[nightly-report-cron] Failed to fetch report for ${venue.name}:`, err.message);
      }
    })
  );

  // 4. Fetch labor data for each venue
  const laborCache = new Map<string, VenueReport['laborData']>();

  await Promise.allSettled(
    orgVenues.map(async (venue) => {
      try {
        const labor = await fetchVenueLabor(supabase, venue.id, businessDate);
        if (labor) {
          laborCache.set(venue.id, labor);
        }
      } catch {
        // Non-critical — skip
      }
    })
  );

  // 4.5. Process manager email notes (Lightspeed/Wynn → parsed → AI narrative)
  await processManagerEmailNotes(org.id, orgVenues, businessDate, reportCache, laborCache);

  // 5. Generate AI summaries per venue (multi-venue only)
  let aiSummaries: Map<string, string> | undefined;
  if (reportCache.size > 1) {
    const venueReports: VenueReport[] = orgVenues
      .filter((v) => reportCache.has(v.id))
      .map((v) => ({
        venueName: v.name,
        venueId: v.id,
        report: reportCache.get(v.id)!,
        laborData: laborCache.get(v.id) || null,
      }));

    aiSummaries = await generateVenueSummaries(venueReports, businessDate);
  }

  // 6. Send emails
  const result = await sendNightlyReportForOrg({
    orgId: org.id,
    orgName: org.name,
    logoUrl: org.logo_url,
    businessDate,
    orgVenues,
    reportCache,
    laborCache,
    aiSummaries,
  });

  return { ...result, venueCount: reportCache.size };
}

// ── Manager Email Notes ──────────────────────────────────────────

/**
 * Fetch manager nightly emails from Outlook, parse them, generate AI narratives,
 * and store in manager_email_notes. Idempotent via email_message_id.
 */
async function processManagerEmailNotes(
  orgId: string,
  orgVenues: Array<{ id: string; name: string }>,
  businessDate: string,
  reportCache: Map<string, NightlyReportData>,
  laborCache: Map<string, VenueReport['laborData']>
): Promise<void> {
  const supabase = getServiceClient();

  // Build venue lookup by KevaOS name → venue record
  const venueByName = new Map<string, { id: string; name: string }>();
  for (const v of orgVenues) {
    venueByName.set(v.name.toLowerCase(), v);
  }

  let emails;
  try {
    emails = await fetchManagerDigestEmails(businessDate);
  } catch (err: any) {
    console.error('[nightly-report-cron] Failed to fetch manager emails:', err.message);
    return;
  }

  if (emails.length === 0) {
    console.log('[nightly-report-cron] No manager digest emails found');
    return;
  }

  let processed = 0;

  for (const email of emails) {
    try {
      // Parse based on format
      const parsed =
        email.format === 'wynn'
          ? parseWynnShiftReport(email.htmlBody, email.subject)
          : parseLightspeedDigest(email.htmlBody, email.subject);

      if (!parsed) continue;

      // For Lightspeed emails: verify the subject date matches the business date
      // The 2-day fetch window can pick up emails from adjacent dates
      if (email.format === 'lightspeed') {
        const subjectDate = extractSubjectDate(email.subject);
        const expectedMD = businessDate.substring(5); // "YYYY-MM-DD" → "MM-DD"
        if (subjectDate && subjectDate !== expectedMD) {
          continue; // Wrong date — skip
        }
      }

      // Resolve venue name → KevaOS venue name
      const kevaosName = resolveVenueName(parsed.venueName);
      if (!kevaosName) {
        console.log(`[nightly-report-cron] Unknown venue from email: "${parsed.venueName}"`);
        continue;
      }

      // Find venue in this org
      const venue = venueByName.get(kevaosName.toLowerCase());
      if (!venue) {
        // Venue exists in alias map but not in this org — skip
        continue;
      }

      // Check if already processed (idempotent)
      const { data: existing } = await (supabase as any)
        .from('manager_email_notes')
        .select('id')
        .eq('venue_id', venue.id)
        .eq('business_date', businessDate)
        .eq('email_message_id', email.messageId)
        .maybeSingle();

      if (existing) continue;

      // Build KPI data from report cache for the AI narrator
      let kpiData = null;
      const report = reportCache.get(venue.id);
      const labor = laborCache.get(venue.id);
      if (report) {
        const s = report.summary;
        kpiData = {
          netSales: s.net_sales,
          covers: s.total_covers,
          totalComps: s.total_comps,
          laborCost: labor?.labor_cost || 0,
          laborPct: labor?.labor_pct || 0,
        };
      }

      // Generate AI narrative from notes + KPIs
      const narrative = await generateNarrativeFromNotes(
        venue.name,
        businessDate,
        parsed.sections,
        kpiData
      );

      // Store in manager_email_notes
      const { error: insertError } = await (supabase as any)
        .from('manager_email_notes')
        .insert({
          venue_id: venue.id,
          business_date: businessDate,
          org_id: orgId,
          source_email: email.fromEmail,
          source_subject: email.subject,
          email_message_id: email.messageId,
          received_at: email.receivedAt,
          raw_sections: parsed.sections,
          closing_narrative: narrative,
        });

      if (insertError) {
        console.error(
          `[nightly-report-cron] Failed to store notes for ${venue.name}:`,
          insertError.message
        );
      } else {
        processed++;
      }
    } catch (err: any) {
      console.error(
        `[nightly-report-cron] Error processing email "${email.subject}":`,
        err.message
      );
    }
  }

  if (processed > 0) {
    console.log(
      `[nightly-report-cron] Processed ${processed} manager email note(s) for ${businessDate}`
    );
  }
}

// ── Data Fetchers ────────────────────────────────────────────────

/**
 * Fetch nightly report data for a venue. Cache-first from tipsee_nightly_cache,
 * then fallback to venue_day_facts.
 */
async function fetchVenueReport(
  supabase: any,
  venueId: string,
  tipseeLocationUuid: string | undefined,
  businessDate: string
): Promise<NightlyReportData | null> {
  // Try cache first
  const { data: cached } = await supabase
    .from('tipsee_nightly_cache')
    .select('report_data')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .maybeSingle();

  if (cached?.report_data) {
    return cached.report_data as NightlyReportData;
  }

  // Fallback to venue_day_facts
  try {
    return await fetchNightlyReportFromFacts(businessDate, venueId);
  } catch {
    return null;
  }
}

/**
 * Fetch labor data for a venue from labor_day_facts.
 */
async function fetchVenueLabor(
  supabase: any,
  venueId: string,
  businessDate: string
): Promise<VenueReport['laborData'] | null> {
  const { data } = await supabase
    .from('labor_day_facts')
    .select('labor_cost, total_hours, employee_count, foh_cost, boh_cost')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .maybeSingle();

  if (!data) return null;

  // Need net_sales to compute labor %
  const { data: dayFact } = await supabase
    .from('venue_day_facts')
    .select('net_sales')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .maybeSingle();

  const netSales = dayFact?.net_sales || 0;

  return {
    labor_cost: data.labor_cost || 0,
    labor_pct: netSales > 0 ? (data.labor_cost / netSales) * 100 : 0,
    total_hours: data.total_hours || 0,
    employee_count: data.employee_count || 0,
    foh_cost: data.foh_cost || 0,
    boh_cost: data.boh_cost || 0,
  };
}
