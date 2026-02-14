/**
 * Mark Notifications as Read
 *
 * POST /api/notifications/mark-read
 *
 * Body:
 *   { id: string }         — mark a single notification as read
 *   { all: true }           — mark all unread notifications as read
 *
 * Auth: Supabase session (user-facing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

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
    const service = getServiceClient();
    const now = new Date().toISOString();

    if (body.all === true) {
      // Mark all unread notifications as read
      const { error } = await (service as any)
        .from('enforcement_notifications')
        .update({ is_read: true, read_at: now })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        throw new Error(`Failed to mark all as read: ${error.message}`);
      }

      return NextResponse.json({ success: true, marked: 'all' });
    }

    if (body.id) {
      // Mark single notification as read
      const { error } = await (service as any)
        .from('enforcement_notifications')
        .update({ is_read: true, read_at: now })
        .eq('id', body.id)
        .eq('user_id', user.id);

      if (error) {
        throw new Error(`Failed to mark as read: ${error.message}`);
      }

      return NextResponse.json({ success: true, marked: body.id });
    }

    return NextResponse.json(
      { error: 'Provide { id: string } or { all: true }' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[Mark Read API] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
