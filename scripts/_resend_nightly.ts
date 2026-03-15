/**
 * One-off script to re-run ETL sync + nightly report for a specific date.
 * Usage: npx tsx scripts/_resend_nightly.ts [date]
 * Default date: yesterday (Pacific time)
 */
import 'dotenv/config';
import { syncAllVenuesForDate } from '@/lib/etl/tipsee-sync';

const dateArg = process.argv[2];
const businessDate = dateArg || (() => {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
})();

async function main() {
  console.log(`\n=== ETL Sync for ${businessDate} ===\n`);
  const results = await syncAllVenuesForDate(businessDate);

  let ok = 0, fail = 0;
  for (const r of results) {
    const tag = r.success ? '✓' : '✗';
    console.log(`  ${tag} ${r.venue_id.substring(0, 8)}  rows:${r.rows_loaded}  ${r.duration_ms}ms  ${r.error || ''}`);
    r.success ? ok++ : fail++;
  }
  console.log(`\nETL done: ${ok} ok, ${fail} failed\n`);

  // Now trigger the nightly report by importing the send function
  console.log(`=== Sending nightly report for ${businessDate} ===\n`);

  const { getServiceClient } = await import('@/lib/supabase/service');
  const { getOrgsWithBriefingEnabled, getOrgVenues, getVenueTipseeMappings, logReportRun } = await import('@/lib/database/nightly-subscribers');
  const { fetchNightlyReportFromFacts } = await import('@/lib/database/tipsee');
  const { sendNightlyReportForOrg } = await import('@/lib/email/send-nightly-report');
  const { generateVenueSummaries } = await import('@/lib/ai/nightly-summarizer');
  const { NightlyReportData } = await import('@/lib/database/tipsee') as any;
  const { VenueReport } = await import('@/lib/email/nightly-report-template') as any;

  const supabase = getServiceClient();
  const orgs = await getOrgsWithBriefingEnabled();
  console.log(`  Found ${orgs.length} org(s) with briefing enabled`);

  for (const org of orgs) {
    const orgVenues = await getOrgVenues(org.id);
    const venueIds = orgVenues.map(v => v.id);
    const tipseeMappings = await getVenueTipseeMappings(venueIds);

    // Fetch report data — cache-first, Simphony live path, then venue_day_facts fallback
    const { fetchSimphonyNightlyReport, getPosTypeForLocations } = await import('@/lib/database/tipsee');
    const reportCache = new Map<string, any>();
    for (const venue of orgVenues) {
      try {
        const tipseeUuid = tipseeMappings.get(venue.id);

        // Try cache first (skip $0)
        const { data: cached } = await (supabase as any)
          .from('tipsee_nightly_cache').select('report_data')
          .eq('venue_id', venue.id).eq('business_date', businessDate).maybeSingle();
        if (cached?.report_data?.summary?.net_sales > 0) {
          reportCache.set(venue.id, cached.report_data);
          continue;
        }

        // Simphony live path (Dallas) — includes BI API comp breakdown
        if (tipseeUuid) {
          try {
            const posType = await getPosTypeForLocations([tipseeUuid]);
            if (posType === 'simphony') {
              const report = await fetchSimphonyNightlyReport(businessDate, tipseeUuid, venue.id);
              if (report && report.summary.net_sales > 0) {
                reportCache.set(venue.id, report);
                continue;
              }
            }
          } catch {}
        }

        // Fallback to venue_day_facts
        const report = await fetchNightlyReportFromFacts(businessDate, venue.id);
        if (report) reportCache.set(venue.id, report);
      } catch {}
    }

    // Fetch labor data
    const laborCache = new Map<string, any>();
    for (const venue of orgVenues) {
      const { data } = await (supabase as any)
        .from('labor_day_facts')
        .select('labor_cost, total_hours, employee_count, foh_cost, boh_cost')
        .eq('venue_id', venue.id)
        .eq('business_date', businessDate)
        .maybeSingle();
      if (data) {
        const { data: dayFact } = await (supabase as any)
          .from('venue_day_facts')
          .select('net_sales')
          .eq('venue_id', venue.id)
          .eq('business_date', businessDate)
          .maybeSingle();
        const netSales = dayFact?.net_sales || 0;
        laborCache.set(venue.id, {
          labor_cost: data.labor_cost || 0,
          labor_pct: netSales > 0 ? (data.labor_cost / netSales) * 100 : 0,
          total_hours: data.total_hours || 0,
          employee_count: data.employee_count || 0,
          foh_cost: data.foh_cost || 0,
          boh_cost: data.boh_cost || 0,
        });
      }
    }

    // Process manager email notes (Lightspeed/Wynn → parsed → AI narrative)
    try {
      const { fetchManagerDigestEmails } = await import('@/lib/email/outlook-digest-fetcher');
      const { parseLightspeedDigest, parseWynnShiftReport, resolveVenueName, extractSubjectDate } = await import('@/lib/email/manager-notes-parser');
      const { generateNarrativeFromNotes } = await import('@/lib/ai/manager-notes-narrator');

      const venueByName = new Map<string, { id: string; name: string }>();
      for (const v of orgVenues) venueByName.set(v.name.toLowerCase(), v);

      const emails = await fetchManagerDigestEmails(businessDate);
      console.log(`  Found ${emails.length} manager digest email(s)`);

      let noteCount = 0;
      for (const email of emails) {
        const parsed = email.format === 'wynn'
          ? parseWynnShiftReport(email.htmlBody, email.subject)
          : parseLightspeedDigest(email.htmlBody, email.subject);
        if (!parsed) continue;

        // Skip Lightspeed emails that don't match the business date
        if (email.format === 'lightspeed') {
          const subjectDate = extractSubjectDate(email.subject);
          const expectedMD = businessDate.substring(5);
          if (subjectDate && subjectDate !== expectedMD) continue;
        }

        const kevaosName = resolveVenueName(parsed.venueName);
        if (!kevaosName) { console.log(`    ? Unknown venue: "${parsed.venueName}"`); continue; }

        const venue = venueByName.get(kevaosName.toLowerCase());
        if (!venue) continue;

        // Check idempotency
        const { data: existing } = await (supabase as any)
          .from('manager_email_notes').select('id')
          .eq('venue_id', venue.id).eq('business_date', businessDate)
          .eq('email_message_id', email.messageId).maybeSingle();
        if (existing) { noteCount++; continue; }

        let kpiData = null;
        const report = reportCache.get(venue.id);
        const labor = laborCache.get(venue.id);
        if (report) {
          const s = report.summary;
          const { fetchCompTrends } = await import('@/lib/database/comp-trends');
          let compTrends = null;
          try { compTrends = await fetchCompTrends(venue.id, businessDate); } catch {}
          kpiData = {
            netSales: s.net_sales, covers: s.total_covers, totalComps: s.total_comps,
            laborCost: labor?.labor_cost || 0, laborPct: labor?.labor_pct || 0,
            compBreakdown: (report.discounts || []).map((d: any) => ({
              reason: d.reason, qty: d.qty, amount: d.amount,
            })),
            compDetails: (report.detailedComps || []).map((c: any) => ({
              server: c.server, compTotal: c.comp_total, checkTotal: c.check_total,
              reason: c.reason, items: c.comped_items || [],
            })),
            compTrends,
          };
        }

        const narrative = await generateNarrativeFromNotes(venue.name, businessDate, parsed.sections, kpiData);

        const { error: insErr } = await (supabase as any).from('manager_email_notes').insert({
          venue_id: venue.id, business_date: businessDate, org_id: org.id,
          source_email: email.fromEmail, source_subject: email.subject,
          email_message_id: email.messageId, received_at: email.receivedAt,
          raw_sections: parsed.sections, closing_narrative: narrative,
        });
        if (insErr) console.error(`    ✗ ${venue.name}:`, insErr.message);
        else noteCount++;
      }
      if (noteCount > 0) console.log(`  Stored/found ${noteCount} manager email note(s)`);
    } catch (emailErr: any) {
      console.log(`  Skipping manager email notes: ${emailErr.message}`);
    }

    // AI summaries
    let aiSummaries: Map<string, string> | undefined;
    if (reportCache.size > 1) {
      const venueReports = orgVenues
        .filter(v => reportCache.has(v.id))
        .map(v => ({
          venueName: v.name,
          venueId: v.id,
          report: reportCache.get(v.id)!,
          laborData: laborCache.get(v.id) || null,
        }));
      aiSummaries = await generateVenueSummaries(venueReports, businessDate);
    }

    // Send
    const startedAt = new Date();
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

    await logReportRun({
      orgId: org.id,
      businessDate,
      sent: result.sent,
      failed: result.failed,
      startedAt,
      error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      details: { venueCount: reportCache.size, resend: true },
    });

    console.log(`  ${org.name}: sent=${result.sent} failed=${result.failed}`);
    if (result.errors.length > 0) {
      console.log(`    errors: ${result.errors.join(', ')}`);
    }
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
