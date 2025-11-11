import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, messageSendSchema } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':messages-send');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(messageSendSchema, body);

      const supabase = await createClient();

      // Verify channel exists and user has access to it
      const { data: channel, error: channelError } = await supabase
        .from('message_channels')
        .select('venue_id')
        .eq('id', validated.channel_id)
        .single();

      if (channelError || !channel) {
        throw {
          status: 404,
          code: 'CHANNEL_NOT_FOUND',
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

      // Create message
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          channel_id: validated.channel_id,
          sender_id: validated.sender_id,
          message_text: validated.message_text,
          message_type: validated.message_type,
          mentioned_employee_ids: validated.mentioned_employee_ids,
          reply_to_message_id: validated.reply_to_message_id,
          is_announcement: validated.is_announcement,
        })
        .select(
          `
          *,
          sender:employees!messages_sender_id_fkey(
            id,
            first_name,
            last_name
          )
        `
        )
        .single();

      if (messageError) throw messageError;

      return NextResponse.json({ success: true, message });
    });
  });
}
