import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const dmChannelSchema = z.object({
  employee_id_1: uuid,
  employee_id_2: uuid,
  venue_id: uuid,
});

// POST /api/messages/dm - Get or create DM channel
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':messages-dm');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(dmChannelSchema, body);

      assertVenueAccess(validated.venue_id, venueIds);

      const supabase = await createClient();

      // Call database function to get or create DM channel
      const { data: channelId, error } = await supabase.rpc(
        'get_or_create_dm_channel',
        {
          emp1_id: validated.employee_id_1,
          emp2_id: validated.employee_id_2,
          v_id: validated.venue_id,
        }
      );

      if (error) throw error;

      // Get the channel details
      const { data: channel, error: channelError } = await supabase
        .from('message_channels')
        .select('*')
        .eq('id', channelId)
        .single();

      if (channelError) throw channelError;

      // Get the other participant's name
      const otherEmployeeId =
        validated.employee_id_1 === channel.participant_ids[0]
          ? channel.participant_ids[1]
          : channel.participant_ids[0];

      const { data: otherEmployee } = await supabase
        .from('employees')
        .select('first_name, last_name')
        .eq('id', otherEmployeeId)
        .single();

      const channelWithName = {
        ...channel,
        name: otherEmployee
          ? `${otherEmployee.first_name} ${otherEmployee.last_name}`
          : 'Unknown User',
      };

      return NextResponse.json({ success: true, channel: channelWithName });
    });
  });
}
