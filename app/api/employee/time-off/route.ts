import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, timeOffRequestSchema, uuid } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const timeOffQuerySchema = z.object({
  employee_id: uuid,
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':time-off-list');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(timeOffQuerySchema, searchParams);

    const supabase = await createClient();

    // Get employee's time off requests
    const { data: requests, error } = await supabase
      .from('time_off_requests')
      .select(
        `
        *,
        reviewed_by:reviewed_by(first_name, last_name)
      `
      )
      .eq('employee_id', params.employee_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Format response
    const formattedRequests = requests?.map((req) => ({
      ...req,
      reviewed_by_name: req.reviewed_by
        ? `${req.reviewed_by.first_name} ${req.reviewed_by.last_name}`
        : null,
    }));

    return NextResponse.json({ success: true, requests: formattedRequests });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':time-off-create');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(timeOffRequestSchema, body);

      assertVenueAccess(validated.venue_id, venueIds);

      const supabase = await createClient();

      // Validate dates
      const start = new Date(validated.start_date);
      const end = new Date(validated.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        throw {
          status: 400,
          code: 'INVALID_DATE',
          message: 'Start date cannot be in the past',
        };
      }

      if (end < start) {
        throw {
          status: 400,
          code: 'INVALID_DATE',
          message: 'End date must be after start date',
        };
      }

      // Calculate total days
      const totalDays =
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Check for overlapping requests
      const { data: existing, error: existingError } = await supabase
        .from('time_off_requests')
        .select('id')
        .eq('employee_id', validated.employee_id)
        .eq('status', 'approved')
        .or(
          `and(start_date.lte.${validated.end_date},end_date.gte.${validated.start_date})`
        );

      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        throw {
          status: 400,
          code: 'OVERLAPPING_REQUEST',
          message: 'You already have approved time off during this period',
        };
      }

      // Check organization settings for minimum notice requirement
      const { data: settings } = await supabase
        .from('organization_settings')
        .select('min_notice_hours_time_off')
        .eq('organization_id', orgId)
        .single();

      const minNoticeHours = settings?.min_notice_hours_time_off || 24;
      const hoursUntilStart =
        (start.getTime() - today.getTime()) / (1000 * 60 * 60);

      if (hoursUntilStart < minNoticeHours) {
        throw {
          status: 400,
          code: 'INSUFFICIENT_NOTICE',
          message: `Time off requests must be submitted at least ${minNoticeHours} hours in advance`,
        };
      }

      // Create time off request
      const { data: newRequest, error: insertError } = await supabase
        .from('time_off_requests')
        .insert({
          venue_id: validated.venue_id,
          employee_id: validated.employee_id,
          request_type: validated.request_type,
          start_date: validated.start_date,
          end_date: validated.end_date,
          total_days: totalDays,
          notes: validated.notes || null,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({ success: true, request: newRequest });
    });
  });
}
