import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

// GET /api/messages/[channelId] - Get messages for a channel
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':messages-list');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const { channelId } = await params;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId)) {
      throw {
        status: 400,
        code: 'INVALID_UUID',
        message: 'Invalid channel ID format',
      };
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const before = searchParams.get('before'); // message_id for pagination

    const supabase = await createClient();

    // Verify channel exists and user has access
    const { data: channel, error: channelError } = await supabase
      .from('message_channels')
      .select('venue_id')
      .eq('id', channelId)
      .single();

    if (channelError) throw channelError;
    if (!channel) {
      throw {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Channel not found',
      };
    }

    if (!venueIds.includes(channel.venue_id)) {
      throw {
        status: 403,
        code: 'FORBIDDEN',
        message: 'No access to this channel',
      };
    }

    let query = supabase
      .from('messages')
      .select(
        `
        *,
        sender:employees!messages_sender_id_fkey(
          id,
          first_name,
          last_name
        ),
        reply_to:messages!messages_reply_to_message_id_fkey(
          id,
          message_text,
          sender:employees!messages_sender_id_fkey(
            first_name,
            last_name
          )
        )
      `
      )
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Pagination: get messages before a specific message
    if (before) {
      const { data: beforeMessage } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', before)
        .single();

      if (beforeMessage) {
        query = query.lt('created_at', beforeMessage.created_at);
      }
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    // Reverse to show oldest first
    const formattedMessages = (messages || []).reverse();

    return NextResponse.json({ success: true, messages: formattedMessages });
  });
}
