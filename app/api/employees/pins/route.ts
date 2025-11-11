import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, pinGenerationSchema, uuid } from '@/lib/validate';
import { z } from 'zod';

const pinsQuerySchema = z.object({
  venue_id: uuid,
  employee_id: uuid.optional(),
});

// GET /api/employees/pins - Get employee PIN info
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':pins-list');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    const params = validateQuery(pinsQuerySchema, request.nextUrl.searchParams);

    // Verify venue access
    assertVenueAccess(params.venue_id, venueIds);

    // Only managers+ can view PINs
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    let query = supabase
      .from('employee_pins')
      .select(
        `
        *,
        employee:employees(id, first_name, last_name, email)
      `
      )
      .eq('venue_id', params.venue_id)
      .eq('is_active', true);

    if (params.employee_id) {
      query = query.eq('employee_id', params.employee_id);
    }

    const { data: pins, error } = await query;

    if (error) throw error;

    // Don't expose actual PIN hashes
    const safePins = pins?.map((pin) => ({
      id: pin.id,
      employee_id: pin.employee_id,
      employee: pin.employee,
      is_active: pin.is_active,
      failed_attempts: pin.failed_attempts,
      locked_until: pin.locked_until,
      last_used_at: pin.last_used_at,
      is_locked: pin.locked_until && new Date(pin.locked_until) > new Date(),
    }));

    return NextResponse.json({ success: true, pins: safePins || [] });
  });
}

// POST /api/employees/pins - Generate or reset PIN
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':pins-generate');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const validated = validate(pinGenerationSchema, body);

    // Verify venue access
    assertVenueAccess(validated.venue_id, venueIds);

    // Only managers+ can generate PINs
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    // Call database function to generate new PIN
    const { data: newPin, error } = await supabase.rpc('generate_employee_pin', {
      p_employee_id: validated.employee_id,
      p_venue_id: validated.venue_id,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      pin: newPin,
      message: 'New PIN generated successfully',
    });
  });
}
