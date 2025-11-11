import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const acceptSwapSchema = z.object({
  swap_id: uuid,
  employee_id: uuid,
});

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-swaps-accept');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(acceptSwapSchema, body);

      const supabase = await createClient();

      const { data: swap, error: swapError } = await supabase
        .from('shift_swap_requests')
        .select('*, original_shift:shift_assignments(scheduled_start, venue_id)')
        .eq('id', validated.swap_id)
        .single();

      if (swapError) throw swapError;
      if (!swap) throw { status: 404, code: 'NOT_FOUND' };
      if (!venueIds.includes(swap.venue_id)) throw { status: 403, code: 'FORBIDDEN' };
      if (swap.swap_employee_id) throw { status: 400, code: 'SWAP_CLAIMED', message: 'This swap has already been claimed' };
      if (swap.status !== 'pending') throw { status: 400, code: 'SWAP_UNAVAILABLE' };

      const shiftStart = new Date(swap.original_shift.scheduled_start);
      if (shiftStart < new Date()) {
        throw { status: 400, code: 'INVALID_SHIFT', message: 'Cannot accept swaps for past shifts' };
      }

      const { error: updateError } = await supabase
        .from('shift_swap_requests')
        .update({
          swap_employee_id: validated.employee_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validated.swap_id);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: 'Swap request submitted for manager approval',
      });
    });
  });
}
