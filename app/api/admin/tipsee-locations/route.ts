import { NextRequest, NextResponse } from 'next/server';
import { getTipseePool } from '@/lib/database/tipsee';
import { guard } from '@/lib/route-guard';

/**
 * GET /api/admin/tipsee-locations
 * List all TipSee locations with their UUIDs and date ranges
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    const pool = getTipseePool();

    const result = await pool.query(`
      SELECT
        location as name,
        location_uuid as uuid,
        MIN(trading_day)::date as first_date,
        MAX(trading_day)::date as last_date,
        COUNT(*)::int as total_checks
      FROM public.tipsee_checks
      WHERE location_uuid IS NOT NULL AND location IS NOT NULL
      GROUP BY location, location_uuid
      ORDER BY location
    `);

    return NextResponse.json({
      locations: result.rows,
      count: result.rows.length,
    });
  });
}
