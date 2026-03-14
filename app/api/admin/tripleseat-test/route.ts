/**
 * Tripleseat API Connection Test
 *
 * GET /api/admin/tripleseat-test
 *
 * Tests the Tripleseat API connection and lists available sites.
 * Platform admin only.
 */

import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/requirePlatformAdmin';
import { fetchSites, searchEvents } from '@/lib/integrations/tripleseat';

export async function GET() {
  try {
    await requirePlatformAdmin();

    // Test 1: Fetch sites
    const sites = await fetchSites();

    // Test 2: Fetch recent events from first site (if any)
    let recentEvents: any[] = [];
    if (sites.length > 0) {
      const today = new Date();
      const thirtyDaysOut = new Date(today);
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

      const startDate = today.toISOString().substring(0, 10);
      const endDate = thirtyDaysOut.toISOString().substring(0, 10);

      const eventsResult = await searchEvents(
        String(sites[0].id),
        startDate,
        endDate,
      );
      recentEvents = eventsResult.results || [];
    }

    return NextResponse.json({
      success: true,
      sites: sites.map(s => ({ id: s.id, name: s.name })),
      sites_count: sites.length,
      sample_events: recentEvents.slice(0, 5).map(e => ({
        id: e.id,
        name: e.event_name,
        date: e.event_date,
        status: e.status,
        guest_count: e.guest_count,
      })),
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tripleseat-test] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
