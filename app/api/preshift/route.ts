/**
 * Preshift Briefing API
 *
 * GET /api/preshift?venue_id=xxx&date=YYYY-MM-DD
 *
 * Returns the full preshift briefing data for a venue:
 * - Unified enforcement items (from both manager_actions and feedback_objects)
 * - Summary counts (total, critical, carried forward, escalated, etc.)
 * - Briefing review status
 * - Attestation gate status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPreshiftSummary } from '@/lib/enforcement/carry-forward';
import { requireUser } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');

    if (!venueId) {
      return NextResponse.json(
        { error: 'venue_id is required' },
        { status: 400 }
      );
    }

    // Compute business date (before 5 AM = previous day)
    const dateParam = searchParams.get('date');
    let businessDate: string;

    if (dateParam) {
      businessDate = dateParam;
    } else {
      const now = new Date();
      if (now.getHours() < 5) {
        now.setDate(now.getDate() - 1);
      }
      businessDate = now.toISOString().split('T')[0];
    }

    const summary = await getPreshiftSummary(venueId, businessDate);

    // Fetch recent verifications (last 7 days) for this venue
    const serviceClient = getServiceClient();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentVerifications } = await (serviceClient as any)
      .from('feedback_outcomes')
      .select(`
        id,
        evaluated_at,
        result,
        verification_spec,
        measured_values,
        window_start,
        window_end,
        days_with_data,
        successor_id,
        feedback_object_id,
        feedback_objects!inner (
          venue_id,
          title,
          domain,
          severity
        )
      `)
      .eq('feedback_objects.venue_id', venueId)
      .gte('evaluated_at', sevenDaysAgo.toISOString())
      .order('evaluated_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      success: true,
      business_date: businessDate,
      ...summary,
      recent_verifications: recentVerifications || [],
    });
  } catch (err: any) {
    console.error('[Preshift API]', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
