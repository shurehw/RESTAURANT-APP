import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, breakSchema } from '@/lib/validate';
import { withIdempotency } from '@/lib/idempotency';

// POST /api/timeclock/breaks - Start or end a break
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':timeclock-breaks');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const body = await request.json();
      const validated = validate(breakSchema, body);

      assertVenueAccess(validated.venue_id, venueIds);

      const supabase = await createClient();
      const now = new Date();

      if (validated.action === 'start') {
        // Find current active punch
        const { data: activePunch } = await supabase
          .from('time_punches')
          .select('id')
          .eq('employee_id', validated.employee_id)
          .eq('punch_type', 'clock_in')
          .order('punch_time', { ascending: false })
          .limit(1)
          .single();

        // Start new break
        const { data: breakRecord, error } = await supabase
          .from('employee_breaks')
          .insert({
            time_punch_id: activePunch?.id,
            employee_id: validated.employee_id,
            venue_id: validated.venue_id,
            break_type: validated.break_type,
            break_start: now.toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Create break_start punch
        await supabase.from('time_punches').insert({
          venue_id: validated.venue_id,
          employee_id: validated.employee_id,
          punch_type: 'break_start',
          punch_time: now.toISOString(),
        });

        return NextResponse.json({
          success: true,
          break: breakRecord,
          message: 'Break started',
        });
      } else {
        // End active break
        const { data: activeBreak } = await supabase
          .from('employee_breaks')
          .select('*')
          .eq('employee_id', validated.employee_id)
          .is('break_end', null)
          .order('break_start', { ascending: false })
          .limit(1)
          .single();

        if (!activeBreak) {
          throw {
            status: 400,
            code: 'NO_ACTIVE_BREAK',
            message: 'No active break found',
          };
        }

        // Calculate break duration
        const breakStart = new Date(activeBreak.break_start);
        const durationMs = now.getTime() - breakStart.getTime();
        const durationMinutes = durationMs / (1000 * 60);

        // Update break record
        const { data: updatedBreak, error } = await supabase
          .from('employee_breaks')
          .update({
            break_end: now.toISOString(),
            break_duration_minutes: durationMinutes,
          })
          .eq('id', activeBreak.id)
          .select()
          .single();

        if (error) throw error;

        // Create break_end punch
        await supabase.from('time_punches').insert({
          venue_id: validated.venue_id,
          employee_id: validated.employee_id,
          punch_type: 'break_end',
          punch_time: now.toISOString(),
        });

        return NextResponse.json({
          success: true,
          break: updatedBreak,
          duration_minutes: Math.round(durationMinutes),
          message: `Break ended (${Math.round(durationMinutes)} minutes)`,
        });
      }
    });
  });
}

// GET /api/timeclock/breaks - Get break status
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':breaks-status');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const employeeId = searchParams.get('employee_id');

    if (!employeeId) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Missing employee_id',
      };
    }

    const supabase = await createClient();

    // Get active break
    const { data: activeBreak } = await supabase
      .from('employee_breaks')
      .select('*')
      .eq('employee_id', employeeId)
      .is('break_end', null)
      .order('break_start', { ascending: false })
      .limit(1)
      .single();

    // Get today's breaks
    const today = new Date().toISOString().split('T')[0];
    const { data: todayBreaks } = await supabase
      .from('employee_breaks')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('break_start', `${today}T00:00:00`)
      .order('break_start', { ascending: false });

    return NextResponse.json({
      success: true,
      on_break: !!activeBreak,
      active_break: activeBreak,
      today_breaks: todayBreaks || [],
    });
  });
}
