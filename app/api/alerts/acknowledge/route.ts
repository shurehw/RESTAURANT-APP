/**
 * POST /api/alerts/acknowledge
 * Acknowledge (dismiss) an alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { z } from 'zod';

const bodySchema = z.object({
  alert_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const body = await req.json();
    const { alert_id } = bodySchema.parse(body);

    const supabase = await createClient();

    // Get alert to verify access
    const { data: alert, error: getError } = await supabase
      .from('alerts')
      .select('venue_id')
      .eq('id', alert_id)
      .single();

    if (getError || !alert) {
      throw { status: 404, code: 'ALERT_NOT_FOUND', message: 'Alert not found' };
    }

    // Verify user has access to this venue
    if (alert.venue_id && !venueIds.includes(alert.venue_id)) {
      throw { status: 403, code: 'ACCESS_DENIED', message: 'Access denied' };
    }

    // Call the acknowledge_alert function
    const { data, error } = await supabase.rpc('acknowledge_alert', {
      p_alert_id: alert_id,
      p_user_id: user.id,
    });

    if (error) {
      throw error;
    }

    if (!data) {
      throw {
        status: 400,
        code: 'ALREADY_ACKNOWLEDGED',
        message: 'Alert already acknowledged',
      };
    }

    return NextResponse.json({
      success: true,
      message: 'Alert acknowledged',
    });
  });
}
