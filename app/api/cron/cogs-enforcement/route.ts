import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { runAllCOGSEnforcement } from '@/lib/database/cogs-enforcement';

/**
 * POST /api/cron/cogs-enforcement
 * Daily cron: runs all COGS enforcement checks for all active venues.
 * Routes violations to Action Center.
 * Trigger via Vercel cron or external scheduler.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Get all active venues with their org + timezone
    const { data: venues } = await (supabase as any)
      .from('venues')
      .select('id, organization_id, timezone')
      .eq('is_active', true);

    const results: Record<string, any> = {};
    let totalViolations = 0;

    for (const venue of venues || []) {
      try {
        const businessDate = getBusinessDateForTimezone(venue.timezone || 'America/Los_Angeles');
        const result = await runAllCOGSEnforcement(
          venue.id,
          venue.organization_id,
          businessDate
        );
        results[venue.id] = { ...result, business_date: businessDate };
        totalViolations += result.total_violations;
      } catch (err: any) {
        results[venue.id] = { error: err.message };
      }
    }

    return NextResponse.json({
      venues_checked: (venues || []).length,
      total_violations: totalViolations,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function getBusinessDateForTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);

  if (hour >= 5) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const prior = new Date(Date.UTC(year, month - 1, day) - 86400000);
  return `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, '0')}-${String(prior.getUTCDate()).padStart(2, '0')}`;
}
