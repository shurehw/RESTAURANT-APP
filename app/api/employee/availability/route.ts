import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const availabilityQuerySchema = z.object({
  employee_id: uuid,
});

const availabilitySchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
  availability: z.array(
    z.object({
      day_of_week: z.number().int().min(0).max(6),
      shift_type: z.enum(['breakfast', 'lunch', 'dinner', 'late_night', 'all_day']),
      is_available: z.boolean(),
    })
  ),
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':availability-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(availabilityQuerySchema, searchParams);

    const supabase = await createClient();

    // Get employee's availability
    const { data: availability, error } = await supabase
      .from('employee_availability')
      .select('*')
      .eq('employee_id', params.employee_id)
      .order('day_of_week', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, availability: availability || [] });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':availability-set');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(availabilitySchema, body);

      assertVenueAccess(validated.venue_id, venueIds);

      const supabase = await createClient();

      // Delete existing availability for this employee
      const { error: deleteError } = await supabase
        .from('employee_availability')
        .delete()
        .eq('employee_id', validated.employee_id);

      if (deleteError) throw deleteError;

      // Insert new availability (only unavailable slots to save space)
      const unavailableSlots = validated.availability
        .filter((a: any) => !a.is_available)
        .map((a: any) => ({
          venue_id: validated.venue_id,
          employee_id: validated.employee_id,
          day_of_week: a.day_of_week,
          shift_type: a.shift_type,
          is_available: false,
        }));

      if (unavailableSlots.length > 0) {
        const { error: insertError } = await supabase
          .from('employee_availability')
          .insert(unavailableSlots);

        if (insertError) throw insertError;
      }

      return NextResponse.json({ success: true });
    });
  });
}
