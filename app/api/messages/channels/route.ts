import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const channelListQuerySchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
});

const channelCreateSchema = z.object({
  venue_id: uuid,
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  channel_type: z.enum(['direct', 'group', 'venue_wide']),
  created_by: uuid,
  member_ids: z.array(uuid).optional(),
});

// GET /api/messages/channels - List all channels for employee
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':channels-list');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(channelListQuerySchema, searchParams);

    assertVenueAccess(params.venue_id, venueIds);

    const supabase = await createClient();

    // Get all channels the employee is a member of
    const { data: channels, error } = await supabase
      .from('channel_members')
      .select(
        `
        unread_count,
        last_read_at,
        channel:message_channels (
          id,
          name,
          description,
          channel_type,
          participant_ids,
          last_message_at,
          message_count,
          is_archived,
          created_at
        )
      `
      )
      .eq('employee_id', params.employee_id)
      .eq('is_active', true)
      .order('channel(last_message_at)', { ascending: false });

    if (error) throw error;

    // For DM channels, get the other participant's name
    const formattedChannels = await Promise.all(
      channels?.map(async (item: any) => {
        const channel = item.channel;

        if (channel.channel_type === 'direct') {
          // Get the other participant
          const otherParticipantId = channel.participant_ids.find(
            (id: string) => id !== params.employee_id
          );

          if (otherParticipantId) {
            const { data: participant } = await supabase
              .from('employees')
              .select('first_name, last_name')
              .eq('id', otherParticipantId)
              .single();

            channel.name = participant
              ? `${participant.first_name} ${participant.last_name}`
              : 'Unknown User';
          }
        }

        return {
          ...channel,
          unread_count: item.unread_count,
          last_read_at: item.last_read_at,
        };
      }) || []
    );

    return NextResponse.json({ success: true, channels: formattedChannels });
  });
}

// POST /api/messages/channels - Create new channel
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':channels-create');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(channelCreateSchema, body);

      assertVenueAccess(validated.venue_id, venueIds);

      const supabase = await createClient();

      // Create channel
      const { data: channel, error: channelError } = await supabase
        .from('message_channels')
        .insert({
          venue_id: validated.venue_id,
          name: validated.name,
          description: validated.description,
          channel_type: validated.channel_type,
          created_by: validated.created_by,
          is_private: validated.channel_type === 'group',
        })
        .select()
        .single();

      if (channelError) throw channelError;

      // Add creator as admin
      await supabase.from('channel_members').insert({
        channel_id: channel.id,
        employee_id: validated.created_by,
        role: 'owner',
      });

      // Add other members
      if (validated.member_ids && Array.isArray(validated.member_ids)) {
        const memberInserts = validated.member_ids
          .filter((id: string) => id !== validated.created_by)
          .map((id: string) => ({
            channel_id: channel.id,
            employee_id: id,
            role: 'member',
          }));

        if (memberInserts.length > 0) {
          await supabase.from('channel_members').insert(memberInserts);
        }
      }

      return NextResponse.json({ success: true, channel });
    });
  });
}
