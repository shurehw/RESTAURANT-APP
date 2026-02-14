/**
 * Notifications API
 *
 * GET /api/notifications
 *
 * Returns the current user's enforcement notifications:
 *   - Unread notifications (all)
 *   - Recent notifications (last 7 days, read or unread)
 *
 * Auth: Supabase session (user-facing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Fetch unread + recent (last 7 days) in one query
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: notifications, error } = await (service as any)
      .from('enforcement_notifications')
      .select('id, org_id, venue_id, notification_type, severity, channel, title, body, action_url, source_table, source_id, is_read, read_at, created_at')
      .eq('user_id', user.id)
      .eq('channel', 'in_app')
      .or(`is_read.eq.false,created_at.gte.${sevenDaysAgo.toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to fetch notifications: ${error.message}`);
    }

    const unreadCount = (notifications || []).filter((n: any) => !n.is_read).length;

    return NextResponse.json({
      notifications: notifications || [],
      unread_count: unreadCount,
    });
  } catch (err: any) {
    console.error('[Notifications API] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
