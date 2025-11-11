import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const markReadSchema = z.object({
  channel_id: uuid,
  employee_id: uuid,
  message_id: uuid.optional(),
});

// POST /api/messages/read - Mark messages as read
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':messages-read');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(markReadSchema, body);

      const supabase = await createClient();

      // Verify channel exists and user has access
      const { data: channel, error: channelError } = await supabase
        .from('message_channels')
        .select('venue_id')
        .eq('id', validated.channel_id)
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

      // Call the database function to mark messages as read
      const { error } = await supabase.rpc('mark_messages_read', {
        p_channel_id: validated.channel_id,
        p_employee_id: validated.employee_id,
        p_until_message_id: validated.message_id || null,
      });

      if (error) throw error;

      return NextResponse.json({ success: true });
    });
  });
}
