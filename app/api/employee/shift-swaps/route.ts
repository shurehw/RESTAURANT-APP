import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const shiftSwapQuerySchema = z.object({
  employee_id: uuid,
});

const shiftSwapSchema = z.object({
  employee_id: uuid,
  original_shift_id: uuid,
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-swaps-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(shiftSwapQuerySchema, searchParams);

    const supabase = await createClient();

    // Get shift swaps where employee is either requester or owner
    const { data: swaps, error } = await supabase
      .from('shift_swap_requests')
      .select(
        `
        *,
        original_shift:shift_assignments!shift_swap_requests_original_shift_id_fkey(
          scheduled_start,
          scheduled_end,
          position:positions(name)
        ),
        original_employee:employees!shift_swap_requests_original_employee_id_fkey(
          first_name,
          last_name
        ),
        swap_employee:employees!shift_swap_requests_swap_employee_id_fkey(
          first_name,
          last_name
        )
      `
      )
      .or(`original_employee_id.eq.${params.employee_id},swap_employee_id.eq.${params.employee_id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Format response
    const formattedSwaps = swaps?.map((swap: any) => ({
      id: swap.id,
      original_shift_date: swap.original_shift?.scheduled_start.split('T')[0],
      original_shift_start: swap.original_shift?.scheduled_start,
      original_shift_end: swap.original_shift?.scheduled_end,
      original_employee_name: swap.original_employee
        ? `${swap.original_employee.first_name} ${swap.original_employee.last_name}`
        : null,
      swap_employee_name: swap.swap_employee
        ? `${swap.swap_employee.first_name} ${swap.swap_employee.last_name}`
        : null,
      position_name: swap.original_shift?.position?.name || 'Unknown',
      status: swap.status,
      created_at: swap.created_at,
      is_requesting: swap.original_employee_id === params.employee_id,
    }));

    return NextResponse.json({ success: true, swaps: formattedSwaps || [] });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-swaps-create');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(shiftSwapSchema, body);

      const supabase = await createClient();

      // Get the shift details
      const { data: shift, error: shiftError } = await supabase
        .from('shift_assignments')
        .select('*, employee:employees(venue_id)')
        .eq('id', validated.original_shift_id)
        .single();

      if (shiftError) throw shiftError;
      if (!shift) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Shift not found' };
      }

      // Verify venue access
      if (!venueIds.includes(shift.employee.venue_id)) {
        throw { status: 403, code: 'FORBIDDEN', message: 'No access to this venue' };
      }

      // Check if shift is in the future
      const shiftStart = new Date(shift.scheduled_start);
      if (shiftStart < new Date()) {
        throw {
          status: 400,
          code: 'INVALID_SHIFT',
          message: 'Cannot swap shifts that have already started',
        };
      }

      // Check organization settings
      const { data: settings } = await supabase
        .from('organization_settings')
        .select('allow_shift_swaps, require_manager_approval_swaps')
        .eq('organization_id', orgId)
        .single();

      if (settings && !settings.allow_shift_swaps) {
        throw {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Shift swaps are not enabled for your organization',
        };
      }

      // Create swap request
      const { data: newSwap, error: insertError } = await supabase
        .from('shift_swap_requests')
        .insert({
          venue_id: shift.employee.venue_id,
          original_shift_id: validated.original_shift_id,
          original_employee_id: shift.employee_id,
          swap_employee_id: null,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({ success: true, swap: newSwap });
    });
  });
}
