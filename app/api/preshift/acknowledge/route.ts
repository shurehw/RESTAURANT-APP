/**
 * Preshift Briefing Acknowledge API
 *
 * POST /api/preshift/acknowledge
 * Body: { venue_id, business_date, notes? }
 *
 * Records that a manager has reviewed the preshift briefing.
 * Snapshots current item counts for audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getUnifiedItems } from '@/lib/enforcement/carry-forward';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { venue_id, business_date, notes } = body;

    if (!venue_id || !business_date) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 }
      );
    }

    // Snapshot current items for audit
    const items = await getUnifiedItems(venue_id);
    const managerActionCount = items.filter(
      (i) => i.source_table === 'manager_action'
    ).length;
    const feedbackObjectCount = items.filter(
      (i) => i.source_table === 'feedback_object'
    ).length;
    const criticalCount = items.filter(
      (i) => i.severity === 'critical'
    ).length;
    const escalatedCount = items.filter(
      (i) => i.status === 'escalated'
    ).length;

    // Upsert briefing record
    const serviceClient = getServiceClient();
    const { data: briefing, error } = await (serviceClient as any)
      .from('preshift_briefings')
      .upsert(
        {
          venue_id,
          business_date,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          manager_action_count: managerActionCount,
          feedback_object_count: feedbackObjectCount,
          critical_count: criticalCount,
          escalated_count: escalatedCount,
          review_notes: notes || null,
        },
        { onConflict: 'venue_id,business_date' }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, briefing });
  } catch (err: any) {
    console.error('[Preshift Acknowledge]', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
