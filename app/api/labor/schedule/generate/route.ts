import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

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

    const scriptPath = path.join(process.cwd(), 'python-services', 'scheduler', 'auto_scheduler.py');
    let command = `python "${scriptPath}" --venue-id ${validated.venue_id} --week-start ${validated.week_start_date}`;
    if (validated.save) command += ' --save';

    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, PYTHONPATH: path.join(process.cwd(), 'python-services') },
      timeout: 120000,
    });

    if (stderr && !stderr.includes('warning')) console.error('Python stderr:', stderr);

    let scheduleId = null;
    let schedule = null;

    if (validated.save) {
      // Saved schedule - get from database
      const match = stdout.match(/Schedule ([a-f0-9-]+) ready/i);
      if (match) scheduleId = match[1];

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
    } else {
      // Non-saved schedule - parse from stdout JSON
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          schedule = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Failed to parse schedule JSON:', e);
      }
    }

    return NextResponse.json({ success: true, schedule_id: scheduleId, schedule, output: stdout });
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

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('weekly_schedules')
      .update(updates)
      .eq('id', validated.schedule_id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ schedule: data });
  });
}
