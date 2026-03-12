/**
 * Rez Yield Metrics ETL — Nightly Computation
 *
 * POST /api/cron/compute-rez-metrics?date=YYYY-MM-DD
 *
 * Runs nightly after service close:
 * 1. Assembles table_seatings from events + checks + reservations
 * 2. Refreshes duration cohorts from historical seatings
 * 3. Refreshes guest profiles from reservation history
 * 4. Enriches demand_calendar for 90-day lookahead (holiday + Tripleseat + Claude)
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  assembleTableSeatings,
  refreshDurationCohorts,
  refreshGuestProfiles,
} from '@/lib/database/rez-yield-metrics';
import { enrichDemandCalendar } from '@/lib/ai/demand-calendar-enricher';

export const maxDuration = 300; // enrichment across all venues can take time

type OrgRow = { id: string };
type VenueRow = { id: string; name: string; city: string | null };
const VENUE_BATCH_SIZE = 3;

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const supabase = getServiceClient();

  // Get all orgs with venues
  const { data: orgRows } = await supabase
    .from('organizations')
    .select('id');
  const orgs = (orgRows ?? []) as OrgRow[];

  if (orgs.length === 0) {
    return NextResponse.json({ message: 'No organizations found' });
  }

  const results: Array<{
    org_id: string;
    venue_id: string;
    seatings: number;
    cohorts: number;
    profiles: number;
    calendar_enriched: number;
    calendar_errors: number;
    error?: string;
  }> = [];

  for (const org of orgs) {
    // Get all venues with name + city for enrichment
    const { data: venueRows } = await supabase
      .from('venues')
      .select('id, name, city')
      .eq('org_id', org.id);
    const venues = (venueRows ?? []) as VenueRow[];

    if (venues.length === 0) continue;

    // 1. Assemble table seatings + cohorts for each venue
    for (let i = 0; i < venues.length; i += VENUE_BATCH_SIZE) {
      const batch = venues.slice(i, i + VENUE_BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (venue) => {
        try {
          const seatingsCount = await assembleTableSeatings(org.id, venue.id, date);
          const cohortsCount = await refreshDurationCohorts(venue.id);

          return {
            org_id: org.id,
            venue_id: venue.id,
            seatings: seatingsCount,
            cohorts: cohortsCount,
            profiles: 0,
            calendar_enriched: 0,
            calendar_errors: 0,
          };
        } catch (err) {
          return {
            org_id: org.id,
            venue_id: venue.id,
            seatings: 0,
            cohorts: 0,
            profiles: 0,
            calendar_enriched: 0,
            calendar_errors: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }));
      results.push(...batchResults);
    }

    // 2. Refresh guest profiles for this org (cross-venue)
    try {
      const profileCount = await refreshGuestProfiles(org.id);
      const orgResults = results.filter((r) => r.org_id === org.id);
      if (orgResults.length > 0) orgResults[0].profiles = profileCount;
    } catch (err) {
      console.error(`[rez-metrics] Failed to refresh profiles for org ${org.id}:`, err);
    }

    // 3. Enrich demand calendar for each venue (90-day lookahead)
    for (let i = 0; i < venues.length; i += VENUE_BATCH_SIZE) {
      const batch = venues.slice(i, i + VENUE_BATCH_SIZE);
      await Promise.all(batch.map(async (venue) => {
        const venueResult = results.find((r) => r.org_id === org.id && r.venue_id === venue.id);
        if (!venueResult) return;

        try {
          const enrichResult = await enrichDemandCalendar({
            orgId: org.id,
            venueId: venue.id,
            venueName: venue.name,
            venueCity: venue.city || venue.name, // fallback to name if city not set
            lookaheadDays: 90,
            maxAgeDays: 7,
          });

          venueResult.calendar_enriched = enrichResult.enriched;
          venueResult.calendar_errors = enrichResult.errors;
        } catch (err) {
          console.error(
            `[rez-metrics] Demand calendar enrichment failed for venue ${venue.id}:`,
            err,
          );
          venueResult.calendar_errors = 1;
        }
      }));
    }
  }

  const elapsed = Date.now() - t0;
  const totalSeatings = results.reduce((s, r) => s + r.seatings, 0);
  const totalCohorts = results.reduce((s, r) => s + r.cohorts, 0);
  const totalProfiles = results.reduce((s, r) => s + r.profiles, 0);
  const totalCalendar = results.reduce((s, r) => s + r.calendar_enriched, 0);
  const totalCalendarErrors = results.reduce((s, r) => s + r.calendar_errors, 0);
  const errors = results.filter((r) => r.error || r.calendar_errors > 0);

  console.log(
    `[rez-metrics] Completed in ${elapsed}ms: ${totalSeatings} seatings, ${totalCohorts} cohorts, ` +
    `${totalProfiles} profiles, ${totalCalendar} calendar dates enriched, ` +
    `${totalCalendarErrors} calendar errors, ${errors.length} venue errors`,
  );

  return NextResponse.json({
    date,
    elapsed_ms: elapsed,
    total_seatings: totalSeatings,
    total_cohorts: totalCohorts,
    total_profiles: totalProfiles,
    total_calendar_enriched: totalCalendar,
    total_calendar_errors: totalCalendarErrors,
    errors: errors.length,
    details: results,
  });
}
