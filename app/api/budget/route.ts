import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';

const budgetQuerySchema = z.object({
  venue: uuid,
  dept: uuid,
  start: z.string().date(),
});

export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':budget');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const { searchParams } = new URL(req.url);
    const params = validateQuery(budgetQuerySchema, searchParams);
    assertVenueAccess(params.venue, venueIds);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('v_declining_budget')
      .select('*')
      .eq('venue_id', params.venue)
      .eq('department_id', params.dept)
      .eq('period_start', params.start)
      .order('day_offset');

    if (error) throw error;
    return NextResponse.json(data || []);
  });
}
