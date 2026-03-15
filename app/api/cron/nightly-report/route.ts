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
import { fetchNightlyReportFromFacts, fetchSimphonyNightlyReport, getPosTypeForLocations, fetchCompsByReason, fetchCompDetails } from '@/lib/database/tipsee';
import { sendNightlyReportForOrg } from '@/lib/email/send-nightly-report';
import type { NightlyReportData } from '@/lib/database/tipsee';
import type { VenueReport } from '@/lib/email/nightly-report-template';
import { generateVenueSummaries } from '@/lib/ai/nightly-summarizer';
import { reviewComps, type CompReviewInput } from '@/lib/ai/comp-reviewer';
import { generateDrillInsights } from '@/lib/ai/drill-insights';
import { saveCompReviewActions, saveDrillInsightActions } from '@/lib/database/control-plane';
import { getCompSettingsForVenue } from '@/lib/database/comp-settings';
import { fetchManagerDigestEmails } from '@/lib/email/outlook-digest-fetcher';
import {
  parseLightspeedDigest,
  parseWynnShiftReport,
  parsePropertyName,
  resolveVenueName,
  extractSubjectDate,
} from '@/lib/email/manager-notes-parser';
import { generateNarrativeFromNotes } from '@/lib/ai/manager-notes-narrator';
import { fetchCompTrends } from '@/lib/database/comp-trends';

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
  const { venuesWithNoNotes } = await processManagerEmailNotes(org.id, orgVenues, businessDate, reportCache, laborCache);

  // 5. Run AI comp review + drill insights → Action Center (before email send)
  if (process.env.ANTHROPIC_API_KEY) {
    await generateActionItems(orgVenues, businessDate, reportCache, laborCache, tipseeMappings);
  }

  // 6. Generate AI summaries per venue (multi-venue only)
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

  // 7. Send emails
  const result = await sendNightlyReportForOrg({
    orgId: org.id,
    orgName: org.name,
    logoUrl: org.logo_url,
    businessDate,
    orgVenues,
    reportCache,
    laborCache,
    aiSummaries,
    venuesWithNoNotes,
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
): Promise<{ venuesWithNoNotes: Set<string> }> {
  const supabase = getServiceClient();
  const venuesWithNoNotes = new Set<string>();

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
    return { venuesWithNoNotes };
  }

  if (emails.length === 0) {
    console.log('[nightly-report-cron] No manager digest emails found');
    return { venuesWithNoNotes };
  }

  // Pre-fetch comp trends for all venues with report data
  const compTrendsCache = new Map<string, any>();
  await Promise.allSettled(
    orgVenues
      .filter(v => reportCache.has(v.id))
      .map(async (v) => {
        try {
          const trends = await fetchCompTrends(v.id, businessDate);
          if (trends) compTrendsCache.set(v.id, trends);
        } catch {}
      })
  );

  let processed = 0;

  for (const email of emails) {
    try {
      // For Lightspeed emails: verify the subject date matches the business date
      // The 2-day fetch window can pick up emails from adjacent dates
      if (email.format === 'lightspeed') {
        const subjectDate = extractSubjectDate(email.subject);
        const expectedMD = businessDate.substring(5); // "YYYY-MM-DD" → "MM-DD"
        if (subjectDate && subjectDate !== expectedMD) {
          continue; // Wrong date — skip
        }
      }

      // Parse based on format
      const parsed =
        email.format === 'wynn'
          ? parseWynnShiftReport(email.htmlBody, email.subject)
          : parseLightspeedDigest(email.htmlBody, email.subject);

      if (!parsed) {
        // Email received but no manager notes sections found — track the venue
        if (email.format === 'lightspeed') {
          const venueName = parsePropertyName(email.subject);
          if (venueName) {
            const kevaos = resolveVenueName(venueName);
            if (kevaos) {
              const venue = venueByName.get(kevaos.toLowerCase());
              if (venue) venuesWithNoNotes.add(venue.id);
            }
          }
        }
        continue;
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
        const compTrends = compTrendsCache.get(venue.id) || null;

        kpiData = {
          netSales: s.net_sales,
          covers: s.total_covers,
          totalComps: s.total_comps,
          laborCost: labor?.labor_cost || 0,
          laborPct: labor?.labor_pct || 0,
          // Comp breakdown by reason (from discounts array)
          compBreakdown: (report.discounts || []).map(d => ({
            reason: d.reason,
            qty: d.qty,
            amount: d.amount,
          })),
          // Per-check comp details with item-level info
          compDetails: (report.detailedComps || []).map(c => ({
            server: c.server,
            compTotal: c.comp_total,
            checkTotal: c.check_total,
            reason: c.reason,
            items: c.comped_items || [],
          })),
          compTrends,
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
  // Remove venues from "no notes" set if they actually had notes processed
  // (venues with notes would have been stored in manager_email_notes)
  if (processed > 0) {
    const { data: notedVenues } = await (supabase as any)
      .from('manager_email_notes')
      .select('venue_id')
      .eq('business_date', businessDate)
      .in('venue_id', [...venuesWithNoNotes]);
    for (const row of notedVenues || []) {
      venuesWithNoNotes.delete(row.venue_id);
    }
  }

  if (venuesWithNoNotes.size > 0) {
    console.log(
      `[nightly-report-cron] ${venuesWithNoNotes.size} venue(s) had digest email but no manager notes`
    );
  }

  return { venuesWithNoNotes };
}

// ── Action Item Generation ───────────────────────────────────────

/**
 * Run AI comp review + drill insights for each venue and save to Action Center.
 * This ensures action items exist BEFORE the nightly email links are clicked.
 */
async function generateActionItems(
  orgVenues: Array<{ id: string; name: string }>,
  businessDate: string,
  reportCache: Map<string, NightlyReportData>,
  laborCache: Map<string, VenueReport['laborData']>,
  tipseeMappings: Map<string, string>
): Promise<void> {
  let compActions = 0;
  let drillActions = 0;

  await Promise.allSettled(
    orgVenues
      .filter((v) => reportCache.has(v.id))
      .map(async (venue) => {
        const report = reportCache.get(venue.id)!;
        const labor = laborCache.get(venue.id);

        // ── Comp Review ──────────────────────────────────────
        // Only run if there are comps to review
        if (report.detailedComps && report.detailedComps.length > 0) {
          try {
            const compSettings = await getCompSettingsForVenue(venue.id);

            // Build review input (same structure as POST /api/ai/comp-review)
            const reviewInput: CompReviewInput = {
              date: businessDate,
              venueName: venue.name,
              allComps: (report.detailedComps || []).map((comp: any) => ({
                check_id: comp.check_id,
                table_name: comp.table_name,
                server: comp.server,
                comp_total: comp.comp_total,
                check_total: comp.check_total,
                reason: comp.reason,
                comped_items: (comp.comped_items || []).map((itemStr: any) => {
                  if (typeof itemStr === 'string') {
                    const amountMatch = itemStr.match(/\(\$([0-9.]+)\)$/);
                    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
                    const namePart = amountMatch
                      ? itemStr.substring(0, itemStr.lastIndexOf('($')).trim()
                      : itemStr;
                    const qtyMatch = namePart.match(/^(.+?)\s+x(\d+)$/);
                    const name = qtyMatch ? qtyMatch[1].trim() : namePart;
                    const quantity = qtyMatch ? parseInt(qtyMatch[2], 10) : 1;
                    return { name, quantity, amount };
                  }
                  return itemStr;
                }),
              })),
              exceptions: {
                summary: {
                  date: businessDate,
                  total_comps: report.summary.total_comps,
                  net_sales: report.summary.net_sales,
                  comp_pct: report.summary.net_sales > 0
                    ? (report.summary.total_comps / report.summary.net_sales) * 100 : 0,
                  comp_pct_status: 'ok' as const,
                  exception_count: 0,
                  critical_count: 0,
                  warning_count: 0,
                },
                exceptions: [],
              },
              summary: {
                total_comps: report.summary.total_comps,
                net_sales: report.summary.net_sales,
                comp_pct: report.summary.net_sales > 0
                  ? (report.summary.total_comps / report.summary.net_sales) * 100 : 0,
                total_checks: report.summary.total_checks,
              },
            };

            // Fetch historical data if TipSee mapping exists
            const tipseeUuid = tipseeMappings.get(venue.id);
            if (tipseeUuid) {
              try {
                const { getTipseePool } = await import('@/lib/database/tipsee');
                const pool = getTipseePool();
                const result = await pool.query(
                  `SELECT
                    AVG(CASE WHEN revenue_total > 0 THEN (comp_total / revenue_total) * 100 ELSE 0 END) as avg_comp_pct,
                    AVG(comp_total) as avg_comp_total,
                    SUM(comp_total) as total_comps,
                    SUM(revenue_total) as total_revenue
                  FROM public.tipsee_checks
                  WHERE location_uuid = $1
                    AND trading_day < $2
                    AND trading_day >= (DATE($2) - INTERVAL '7 days')::date`,
                  [tipseeUuid, businessDate]
                );
                const row = result.rows[0];
                reviewInput.historical = {
                  avg_daily_comp_pct: parseFloat(row?.avg_comp_pct || '0'),
                  avg_daily_comp_total: parseFloat(row?.avg_comp_total || '0'),
                  previous_week_comp_pct: parseFloat(row?.total_revenue || '0') > 0
                    ? (parseFloat(row?.total_comps || '0') / parseFloat(row?.total_revenue || '0')) * 100
                    : 0,
                };
              } catch {
                reviewInput.historical = { avg_daily_comp_pct: 0, avg_daily_comp_total: 0, previous_week_comp_pct: 0 };
              }
            }

            const review = await reviewComps(reviewInput, compSettings ?? undefined);

            if (review.recommendations.length > 0) {
              const saved = await saveCompReviewActions(venue.id, businessDate, venue.name, review.recommendations);
              compActions += saved.actionsCreated;
            }
          } catch (err: any) {
            console.error(`[nightly-report-cron] Comp review failed for ${venue.name}:`, err.message);
          }
        }

        // ── Drill Insights (comps, servers, labor) ───────────
        const sections = ['comps', 'servers', 'labor'];
        for (const section of sections) {
          try {
            let sectionData: any;
            if (section === 'comps') {
              sectionData = {
                discounts: report.discounts,
                detailedComps: report.detailedComps,
                summary: report.summary,
              };
            } else if (section === 'servers') {
              sectionData = {
                servers: report.servers,
                summary: report.summary,
              };
            } else if (section === 'labor' && labor) {
              sectionData = {
                labor,
                summary: report.summary,
              };
            } else {
              continue;
            }

            const insights = await generateDrillInsights({
              section,
              venueName: venue.name,
              date: businessDate,
              data: sectionData,
            });

            if (insights.length > 0) {
              const saved = await saveDrillInsightActions(
                venue.id, businessDate, venue.name, section, insights
              );
              drillActions += saved.actionsCreated;
            }
          } catch (err: any) {
            console.error(`[nightly-report-cron] Drill insights (${section}) failed for ${venue.name}:`, err.message);
          }
        }
      })
  );

  if (compActions > 0 || drillActions > 0) {
    console.log(
      `[nightly-report-cron] Action Center: ${compActions} comp actions, ${drillActions} drill insights created`
    );
  }
}

// ── Data Fetchers ────────────────────────────────────────────────

/**
 * Fetch nightly report data for a venue. Cache-first from tipsee_nightly_cache,
 * then fallback to venue_day_facts.
 *
 * For Simphony venues (e.g. Dallas): if cache has $0 or no data, try the live
 * Simphony path which fetches comp breakdown from the BI API.
 */
async function fetchVenueReport(
  supabase: any,
  venueId: string,
  tipseeLocationUuid: string | undefined,
  businessDate: string
): Promise<NightlyReportData | null> {
  // Detect POS type upfront so we can route Simphony differently
  let posType: string | null = null;
  if (tipseeLocationUuid) {
    try {
      posType = await getPosTypeForLocations([tipseeLocationUuid]);
    } catch {}
  }

  // For Simphony venues: venue_day_facts is the primary source (populated by ETL),
  // then enrich with cache data (comp details, servers) if available
  if (posType === 'simphony') {
    let factsReport: NightlyReportData | null = null;
    try {
      factsReport = await fetchNightlyReportFromFacts(businessDate, venueId);
    } catch (err: any) {
      console.error(`[nightly-report-cron] Facts fetch failed for Simphony venue ${venueId}:`, err.message);
    }

    // Enrich with cache data (has comp details, servers from BI API)
    const { data: cached } = await supabase
      .from('tipsee_nightly_cache')
      .select('report_data')
      .eq('venue_id', venueId)
      .eq('business_date', businessDate)
      .maybeSingle();

    if (cached?.report_data?.summary?.net_sales > 0) {
      // Cache has full report with comp/server detail — prefer it
      return cached.report_data as NightlyReportData;
    }

    // If facts has data, use it (even without comp/server detail)
    if (factsReport && factsReport.summary.net_sales > 0) {
      return factsReport;
    }

    // Last resort: try Simphony live
    try {
      const report = await fetchSimphonyNightlyReport(businessDate, tipseeLocationUuid!, venueId);
      if (report && report.summary.net_sales > 0) {
        return report;
      }
      console.warn(`[nightly-report-cron] Simphony live returned $0 for venue ${venueId} on ${businessDate}`);
    } catch (err: any) {
      console.error(`[nightly-report-cron] Simphony live failed for venue ${venueId}:`, err.message);
    }

    // Return whatever we have (facts $0 is better than null)
    return factsReport;
  }

  // Non-Simphony venues: cache-first (Upserve cache has full detail)
  const { data: cached } = await supabase
    .from('tipsee_nightly_cache')
    .select('report_data')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .maybeSingle();

  if (cached?.report_data) {
    const summary = cached.report_data.summary;
    if (summary && summary.net_sales > 0) {
      return cached.report_data as NightlyReportData;
    }
  }

  // Fallback to venue_day_facts
  try {
    return await fetchNightlyReportFromFacts(businessDate, venueId);
  } catch (err: any) {
    console.error(`[nightly-report-cron] Facts fallback failed for venue ${venueId}:`, err.message);
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
