/**
 * Time Clock Punch API
 * Clock in/out with photo & GPS verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { z } from 'zod';

const punchSchema = z.object({
  employee_id: z.string().uuid(),
  venue_id: z.string().uuid(),
  punch_type: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  accuracy: z.string().optional(),
  device_id: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':timeclock-punch');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds } = await getUserOrgAndVenues(user.id);

      const supabase = await createClient();
      const formData = await request.formData();

      // Extract and validate form data
      const data = {
        employee_id: formData.get('employee_id') as string,
        venue_id: formData.get('venue_id') as string,
        punch_type: formData.get('punch_type') as string,
        latitude: formData.get('latitude') as string | undefined,
        longitude: formData.get('longitude') as string | undefined,
        accuracy: formData.get('accuracy') as string | undefined,
        device_id: formData.get('device_id') as string | undefined,
      };

      const validated = punchSchema.parse(data);
      assertVenueAccess(validated.venue_id, venueIds);

      const photo = formData.get('photo') as File | null;
      const now = new Date();
      const businessDate = now.toISOString().split('T')[0];

      // Check if employee can clock in (early prevention, overtime)
      if (validated.punch_type === 'clock_in') {
        const { data: canClockIn, error: checkError } = await supabase.rpc(
          'can_clock_in',
          {
            p_employee_id: validated.employee_id,
            p_venue_id: validated.venue_id,
            p_current_time: now.toISOString(),
          }
        );

        if (checkError) {
          console.error('Clock-in check error:', checkError);
        } else if (canClockIn && canClockIn.length > 0 && !canClockIn[0].allowed) {
          return NextResponse.json(
            {
              error: 'Clock-in prevented',
              reason: canClockIn[0].reason,
              prevented: true,
            },
            { status: 403 }
          );
        }
      }

      // Upload photo if provided
      let photoUrl = null;
      if (photo) {
        const fileName = `${validated.venue_id}/${validated.employee_id}/${Date.now()}_${photo.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('time-clock-photos')
          .upload(fileName, photo, {
            contentType: photo.type,
            upsert: false,
          });

        if (uploadError) {
          console.error('Photo upload error:', uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from('time-clock-photos')
            .getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        }
      }

      // Get IP address and user agent
      const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
      const userAgent = request.headers.get('user-agent') || null;

      // Find active shift assignment (if any)
      let shiftAssignmentId = null;
      const { data: activeShifts } = await supabase
        .from('shift_assignments')
        .select('id')
        .eq('employee_id', validated.employee_id)
        .eq('business_date', businessDate)
        .eq('status', 'scheduled')
        .lte('scheduled_start', now.toISOString())
        .gte('scheduled_end', now.toISOString())
        .limit(1);

      if (activeShifts && activeShifts.length > 0) {
        shiftAssignmentId = activeShifts[0].id;
      }

      // Create time punch record
      const punchData: any = {
        venue_id: validated.venue_id,
        employee_id: validated.employee_id,
        shift_assignment_id: shiftAssignmentId,
        punch_type: validated.punch_type,
        punch_time: now.toISOString(),
        business_date: businessDate,
        location_lat: validated.latitude ? parseFloat(validated.latitude) : null,
        location_lng: validated.longitude ? parseFloat(validated.longitude) : null,
        location_accuracy: validated.accuracy ? parseFloat(validated.accuracy) : null,
        photo_url: photoUrl,
        device_id: validated.device_id,
        ip_address: ipAddress,
        user_agent: userAgent,
        is_manual_entry: false,
      };

      const { data: punch, error: punchError } = await supabase
        .from('time_punches')
        .insert(punchData)
        .select(`
          *,
          employee:employees(first_name, last_name)
        `)
        .single();

      if (punchError) {
        console.error('Punch insert error:', punchError);
        throw punchError;
      }

      // Check if punch was flagged
      const warnings = [];
      if (punch.is_flagged) {
        warnings.push({
          type: 'flagged',
          message: punch.flag_reason || 'Punch requires manager review',
        });
      }

      // Update shift assignment actual times
      if (shiftAssignmentId) {
        if (validated.punch_type === 'clock_in') {
          await supabase
            .from('shift_assignments')
            .update({ actual_start: now.toISOString() })
            .eq('id', shiftAssignmentId);
        } else if (validated.punch_type === 'clock_out') {
          await supabase
            .from('shift_assignments')
            .update({ actual_end: now.toISOString() })
            .eq('id', shiftAssignmentId);
        }
      }

      return NextResponse.json({
        success: true,
        punch,
        warnings,
        message: `${validated.punch_type.replace('_', ' ')} successful at ${now.toLocaleTimeString()}`,
      });
    });
  });
}

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':timeclock-status');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const employeeId = searchParams.get('employee_id');
    const venueId = searchParams.get('venue_id');
    const businessDate = searchParams.get('business_date') || new Date().toISOString().split('T')[0];

    if (!employeeId || !venueId) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'employee_id and venue_id required',
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(employeeId) || !uuidRegex.test(venueId)) {
      throw {
        status: 400,
        code: 'INVALID_UUID',
        message: 'Invalid UUID format',
      };
    }

    assertVenueAccess(venueId, venueIds);

    const supabase = await createClient();

    // Get punches for today
    const { data: punches, error } = await supabase
      .from('time_punches')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('venue_id', venueId)
      .eq('business_date', businessDate)
      .order('punch_time', { ascending: true });

    if (error) throw error;

    // Determine current clock status
    let clockedIn = false;
    let onBreak = false;
    let lastPunch = null;

    if (punches && punches.length > 0) {
      lastPunch = punches[punches.length - 1];

      if (lastPunch.punch_type === 'clock_in') {
        clockedIn = true;
        onBreak = false;
      } else if (lastPunch.punch_type === 'break_start') {
        clockedIn = true;
        onBreak = true;
      } else if (lastPunch.punch_type === 'break_end') {
        clockedIn = true;
        onBreak = false;
      } else if (lastPunch.punch_type === 'clock_out') {
        clockedIn = false;
        onBreak = false;
      }
    }

    // Calculate hours worked today
    let hoursWorked = 0;
    let clockInTime = null;

    for (const punch of punches || []) {
      if (punch.punch_type === 'clock_in') {
        clockInTime = new Date(punch.punch_time);
      } else if (punch.punch_type === 'clock_out' && clockInTime) {
        const clockOutTime = new Date(punch.punch_time);
        const hours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
        hoursWorked += hours;
        clockInTime = null;
      }
    }

    // If still clocked in, add current time
    if (clockInTime && clockedIn) {
      const now = new Date();
      const hours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
      hoursWorked += hours;
    }

    return NextResponse.json({
      clockedIn,
      onBreak,
      lastPunch,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      punches,
    });
  });
}
