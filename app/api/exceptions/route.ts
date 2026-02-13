/**
 * GET /api/exceptions
 * Returns exception-first view: only items requiring operator attention
 * Query params: venue_id (optional), severity (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = req.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const severity = searchParams.get('severity'); // info, warning, critical

    const supabase = await createClient();

    let query = (supabase as any)
      .from('operational_exceptions')
      .select('*')
      .in('venue_id', venueIds)
      .order('business_date', { ascending: false })
      .order('severity', { ascending: false });

    // Filter by venue if specified
    if (venueId && venueIds.includes(venueId)) {
      query = query.eq('venue_id', venueId);
    }

    // Filter by severity if specified
    if (severity && ['info', 'warning', 'critical'].includes(severity)) {
      query = query.eq('severity', severity);
    }

    const { data: exceptions, error } = await query;

    if (error) {
      throw error;
    }

    // Group exceptions by type for summary
    const summary = {
      total: exceptions?.length || 0,
      critical: exceptions?.filter((e: any) => e.severity === 'critical').length || 0,
      warning: exceptions?.filter((e: any) => e.severity === 'warning').length || 0,
      info: exceptions?.filter((e: any) => e.severity === 'info').length || 0,
      byType: {} as Record<string, number>,
    };

    exceptions?.forEach((e: any) => {
      summary.byType[e.exception_type] = (summary.byType[e.exception_type] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        exceptions: exceptions || [],
        summary,
      },
    });
  });
}
