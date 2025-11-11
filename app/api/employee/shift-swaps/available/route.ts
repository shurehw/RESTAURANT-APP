import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';

const availableSwapsQuerySchema = z.object({
  employee_id: uuid,
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-swaps-available');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(availableSwapsQuerySchema, searchParams);

    const supabase = await createClient();

    const { data: employee, error: empError} = await supabase
      .from('employees')
      .select('venue_id, position_id')
      .eq('id', params.employee_id)
      .single();

    if (empError) throw empError;
    if (!employee) throw { status: 404, code: 'NOT_FOUND', message: 'Employee not found' };
    if (!venueIds.includes(employee.venue_id)) throw { status: 403, code: 'FORBIDDEN' };

    const { data: openSwaps, error } = await supabase
      .from('shift_swap_requests')
      .select(`
        *,
        original_shift:shift_assignments!shift_swap_requests_original_shift_id_fkey(
          id, scheduled_start, scheduled_end, position_id,
          position:positions(name)
        ),
        original_employee:employees!shift_swap_requests_original_employee_id_fkey(
          first_name, last_name
        )
      `)
      .eq('venue_id', employee.venue_id)
      .eq('status', 'pending')
      .is('swap_employee_id', null)
      .neq('original_employee_id', params.employee_id)
      .gte('original_shift.scheduled_start', new Date().toISOString());

    if (error) throw error;

    const formattedShifts = openSwaps
      ?.filter((swap: any) => swap.original_shift?.position_id === employee.position_id)
      .map((swap: any) => ({
        id: swap.original_shift?.id,
        swap_request_id: swap.id,
        employee_name: swap.original_employee
          ? `${swap.original_employee.first_name} ${swap.original_employee.last_name}`
          : 'Unknown',
        shift_date: swap.original_shift?.scheduled_start.split('T')[0],
        shift_start: swap.original_shift?.scheduled_start,
        shift_end: swap.original_shift?.scheduled_end,
        position_name: swap.original_shift?.position?.name || 'Unknown',
      }));

    return NextResponse.json({ success: true, shifts: formattedShifts || [] });
  });
}
