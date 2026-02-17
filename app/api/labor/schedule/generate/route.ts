import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';
import { generateScheduleTS } from '@/lib/scheduler-lite';

const generateSchema = z.object({
  venue_id: uuid,
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  save: z.boolean().optional(),
});

const scheduleQuerySchema = z.object({
  venue_id: uuid,
  schedule_id: uuid.optional(),
  week_start: z.string().date().optional(),
});

const scheduleUpdateSchema = z.object({
  schedule_id: uuid,
  status: z.enum(['draft', 'published', 'locked']).optional(),
});

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':schedule-generate');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(generateSchema, body);
    assertVenueAccess(validated.venue_id, venueIds);

    // Generate schedule using TS scheduler
    const result = await generateScheduleTS(
      validated.venue_id,
      validated.week_start_date,
      validated.save !== false
    );

    const scheduleId = result.scheduleId;
    let schedule: any = null;

    // Fetch the saved schedule from DB
    if (scheduleId) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('weekly_schedules')
        .select(`*, shifts:shift_assignments(*, employee:employees(first_name, last_name), position:positions(name, category, base_hourly_rate))`)
        .eq('id', scheduleId)
        .single();
      if (error) throw error;
      schedule = data;
    }

    if (!schedule && !scheduleId) {
      return NextResponse.json({
        success: false,
        error: 'NO_SCHEDULE',
        message: 'Scheduler produced no schedule. Check employees and positions.',
      }, { status: 422 });
    }

    return NextResponse.json({ success: true, schedule_id: scheduleId, schedule });
  });
}

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':schedule-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(scheduleQuerySchema, searchParams);
    assertVenueAccess(params.venue_id, venueIds);

    const supabase = await createClient();
    let query = supabase
      .from('weekly_schedules')
      .select(`*, shifts:shift_assignments(*, employee:employees(first_name, last_name, email), position:positions(name, category, base_hourly_rate))`)
      .eq('venue_id', params.venue_id);

    if (params.schedule_id) {
      query = query.eq('id', params.schedule_id);
      const { data, error } = await query.single();
      if (error) throw error;
      return NextResponse.json({ schedule: data });
    } else if (params.week_start) {
      query = query.eq('week_start_date', params.week_start);
      const { data, error } = await query.single();
      if (error) throw error;
      return NextResponse.json({ schedule: data });
    } else {
      query = query.order('week_start_date', { ascending: false }).limit(10);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ schedules: data });
    }
  });
}

export async function PATCH(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':schedule-update');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(scheduleUpdateSchema, body);

    const updates: any = { updated_at: new Date().toISOString() };
    if (validated.status) {
      updates.status = validated.status;
      if (validated.status === 'published') updates.published_at = new Date().toISOString();
    }

    // Use admin client to bypass RLS (auth validated above)
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('weekly_schedules')
      .update(updates)
      .eq('id', validated.schedule_id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, schedule: data });
  });
}
