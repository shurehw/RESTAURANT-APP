import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getTipseePool } from '@/lib/database/tipsee';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';
import { getTablesForVenue, upsertTable } from '@/lib/database/floor-plan';
import { getSectionsForVenue } from '@/lib/database/floor-plan';

/**
 * POST /api/floor-plan/import-sr
 * Import table numbers from SevenRooms reservation history.
 * Extracts distinct table_numbers + venue_seating_area_name from full_reservations (last 90 days).
 * Creates venue_tables entries for any tables not already in the DB.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id } = body;

    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    // Get TipSee location UUIDs for this venue
    const locationUuids = await getTipseeMappingForVenue(venue_id);
    if (locationUuids.length === 0) {
      return NextResponse.json(
        { error: 'No TipSee mapping found for this venue' },
        { status: 400 },
      );
    }

    // Query distinct table numbers and seating areas from reservation history
    const pool = getTipseePool();
    const { rows } = await pool.query(
      `SELECT
         TRIM(t.table_num) AS table_num,
         r.venue_seating_area_name,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.max_guests) AS median_capacity
       FROM public.full_reservations r,
            LATERAL unnest(r.table_numbers) AS t(table_num)
       WHERE r.location_uuid = ANY($1::uuid[])
         AND r.date >= CURRENT_DATE - INTERVAL '90 days'
         AND r.table_numbers IS NOT NULL
         AND array_length(r.table_numbers, 1) > 0
       GROUP BY TRIM(t.table_num), r.venue_seating_area_name
       ORDER BY TRIM(t.table_num)`,
      [locationUuids],
    );

    if (rows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: 0, message: 'No table data found in recent reservations' });
    }

    // Get existing tables and sections for matching
    const existingTables = await getTablesForVenue(venue_id);
    const existingNumbers = new Set(existingTables.map((t) => t.table_number));
    const sections = await getSectionsForVenue(venue_id);
    const sectionBySrArea = new Map(
      sections.filter((s) => s.sr_seating_area).map((s) => [s.sr_seating_area!, s.id]),
    );

    // Deduplicate by table_num (a table can appear with multiple seating areas — use first)
    const tableMap = new Map<string, { seating_area: string | null; capacity: number }>();
    for (const row of rows) {
      const num = row.table_num?.trim();
      if (!num || tableMap.has(num)) continue;
      tableMap.set(num, {
        seating_area: row.venue_seating_area_name || null,
        capacity: Math.round(row.median_capacity) || 4,
      });
    }

    let imported = 0;
    let skipped = 0;

    for (const [tableNum, info] of tableMap) {
      if (existingNumbers.has(tableNum)) {
        skipped++;
        continue;
      }

      // Infer shape from table number pattern
      const shape = tableNum.startsWith('B') || tableNum.toLowerCase().includes('bar')
        ? 'bar_seat'
        : 'round';

      // Match seating area to section
      const sectionId = info.seating_area
        ? sectionBySrArea.get(info.seating_area) || null
        : null;

      await upsertTable(venue_id, orgId, {
        table_number: tableNum,
        min_capacity: 1,
        max_capacity: info.capacity,
        shape,
        section_id: sectionId,
      });

      imported++;
    }

    return NextResponse.json({
      imported,
      skipped,
      message: `Imported ${imported} tables, skipped ${skipped} existing`,
    });
  });
}
