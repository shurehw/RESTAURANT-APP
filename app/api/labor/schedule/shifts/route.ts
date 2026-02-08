import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { z } from 'zod';

/** GET - Fetch employees, positions, or change log for a venue */
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-data');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const sp = request.nextUrl.searchParams;
    const venueId = sp.get('venue_id');
    if (venueId) assertVenueAccess(venueId, venueIds);

    const supabase = await createClient();

    // Return active employees for a venue
    if (sp.get('employees') === 'true' && venueId) {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, primary_position_id')
        .eq('venue_id', venueId)
        .eq('employment_status', 'active')
        .order('first_name');
      if (error) throw error;
      return NextResponse.json({ employees: data });
    }

    // Return active positions for a venue
    if (sp.get('positions') === 'true' && venueId) {
      const { data, error } = await supabase
        .from('positions')
        .select('id, name, category, base_hourly_rate')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return NextResponse.json({ positions: data });
    }

    // Return change log (manager_feedback) for a venue/week
    if (sp.get('changes_only') === 'true' && venueId) {
      const weekStart = sp.get('week_start');
      const weekEnd = sp.get('week_end');
      let query = supabase
        .from('manager_feedback')
        .select('id, feedback_type, business_date, original_recommendation, manager_decision, reason, created_at')
        .eq('venue_id', venueId)
        .eq('feedback_type', 'override')
        .order('created_at', { ascending: false })
        .limit(50);

      if (weekStart) query = query.gte('business_date', weekStart);
      if (weekEnd) query = query.lte('business_date', weekEnd);

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ changes: data });
    }

    return NextResponse.json({ error: 'Missing query parameters' }, { status: 400 });
  });
}

const SHIFT_TIMES: Record<string, { start: string; end: string; hours: number }> = {
  breakfast: { start: '07:00', end: '14:00', hours: 7 },
  lunch: { start: '11:00', end: '16:00', hours: 5 },
  dinner: { start: '17:00', end: '23:00', hours: 6 },
  late_night: { start: '22:00', end: '02:00', hours: 4 },
};

const editShiftSchema = z.object({
  shift_id: uuid,
  employee_id: uuid.optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  scheduled_hours: z.number().positive().optional(),
  status: z.enum(['scheduled', 'confirmed', 'cancelled']).optional(),
  reason: z.string().min(1, 'A reason is required for changes'),
  reason_category: z.string().optional(),
});

const addShiftSchema = z.object({
  schedule_id: uuid,
  employee_id: uuid,
  position_id: uuid,
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift_type: z.enum(['breakfast', 'lunch', 'dinner', 'late_night']),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  scheduled_hours: z.number().positive().optional(),
  reason: z.string().min(1, 'A reason is required'),
  reason_category: z.string().optional(),
});

const deleteShiftSchema = z.object({
  shift_id: uuid,
  reason: z.string().min(1, 'A reason is required for removing a shift'),
  reason_category: z.string().optional(),
});

/** PATCH - Edit an existing shift assignment */
export async function PATCH(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-edit');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(editShiftSchema, body);

    const supabase = await createClient();

    // Fetch original shift before editing
    const { data: original, error: fetchErr } = await supabase
      .from('shift_assignments')
      .select('*, employee:employees(first_name, last_name), position:positions(name), schedule:weekly_schedules(venue_id)')
      .eq('id', validated.shift_id)
      .single();

    if (fetchErr || !original) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Shift not found' };
    }

    // Build update payload
    const updates: Record<string, any> = {
      is_modified: true,
      modification_reason: validated.reason,
      modified_by: user.id,
      modified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (validated.employee_id) updates.employee_id = validated.employee_id;
    if (validated.scheduled_start) updates.scheduled_start = validated.scheduled_start;
    if (validated.scheduled_end) updates.scheduled_end = validated.scheduled_end;
    if (validated.scheduled_hours) updates.scheduled_hours = validated.scheduled_hours;
    if (validated.status) updates.status = validated.status;

    // Apply update
    const { data: updated, error: updateErr } = await supabase
      .from('shift_assignments')
      .update(updates)
      .eq('id', validated.shift_id)
      .select('*, employee:employees(id, first_name, last_name, email), position:positions(id, name, category, base_hourly_rate)')
      .single();

    if (updateErr) throw updateErr;

    // Log to manager_feedback for model learning
    const newValues: Record<string, any> = {};
    if (validated.employee_id) newValues.employee_id = validated.employee_id;
    if (validated.scheduled_start) newValues.scheduled_start = validated.scheduled_start;
    if (validated.scheduled_end) newValues.scheduled_end = validated.scheduled_end;
    if (validated.scheduled_hours) newValues.scheduled_hours = validated.scheduled_hours;

    await supabase.from('manager_feedback').insert({
      venue_id: original.schedule.venue_id,
      manager_id: user.id,
      feedback_type: 'override',
      business_date: original.business_date,
      original_recommendation: JSON.stringify({
        employee_id: original.employee_id,
        employee_name: original.employee ? `${original.employee.first_name} ${original.employee.last_name}` : null,
        position_name: original.position?.name,
        scheduled_start: original.scheduled_start,
        scheduled_end: original.scheduled_end,
        scheduled_hours: original.scheduled_hours,
      }),
      manager_decision: JSON.stringify({
        ...newValues,
        employee_name: updated.employee ? `${updated.employee.first_name} ${updated.employee.last_name}` : null,
      }),
      reason: `[${validated.reason_category || 'Other'}] ${validated.reason}`,
    });

    return NextResponse.json({ success: true, shift: updated });
  });
}

/** POST - Add a new shift to a schedule */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-add');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(addShiftSchema, body);

    const supabase = await createClient();

    // Get venue_id from schedule
    const { data: schedule, error: schedErr } = await supabase
      .from('weekly_schedules')
      .select('venue_id')
      .eq('id', validated.schedule_id)
      .single();

    if (schedErr || !schedule) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Schedule not found' };
    }

    // Calculate times from shift type defaults if not provided
    const shiftConfig = SHIFT_TIMES[validated.shift_type];
    const startTime = validated.scheduled_start || `${validated.business_date}T${shiftConfig.start}:00`;
    const endTime = validated.scheduled_end || `${validated.business_date}T${shiftConfig.end}:00`;
    const hours = validated.scheduled_hours || shiftConfig.hours;

    // Get hourly rate from position
    const { data: position } = await supabase
      .from('positions')
      .select('base_hourly_rate')
      .eq('id', validated.position_id)
      .single();

    const hourlyRate = position ? Number(position.base_hourly_rate) : 0;

    const newShift = {
      schedule_id: validated.schedule_id,
      venue_id: schedule.venue_id,
      employee_id: validated.employee_id,
      position_id: validated.position_id,
      business_date: validated.business_date,
      shift_type: validated.shift_type,
      scheduled_start: startTime,
      scheduled_end: endTime,
      scheduled_hours: hours,
      hourly_rate: hourlyRate,
      scheduled_cost: hours * hourlyRate,
      status: 'scheduled',
      is_modified: true,
      modification_reason: `[Added] ${validated.reason}`,
      modified_by: user.id,
      modified_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('shift_assignments')
      .insert(newShift)
      .select('*, employee:employees(id, first_name, last_name, email), position:positions(id, name, category, base_hourly_rate)')
      .single();

    if (insertErr) throw insertErr;

    // Log to manager_feedback
    await supabase.from('manager_feedback').insert({
      venue_id: schedule.venue_id,
      manager_id: user.id,
      feedback_type: 'override',
      business_date: validated.business_date,
      original_recommendation: JSON.stringify({ action: 'no_shift_scheduled' }),
      manager_decision: JSON.stringify({
        action: 'added_shift',
        employee_id: validated.employee_id,
        position_id: validated.position_id,
        shift_type: validated.shift_type,
        scheduled_hours: hours,
      }),
      reason: `[${validated.reason_category || 'Other'}] ${validated.reason}`,
    });

    // Recalculate schedule totals
    const { data: allShifts } = await supabase
      .from('shift_assignments')
      .select('scheduled_hours, scheduled_cost')
      .eq('schedule_id', validated.schedule_id)
      .neq('status', 'cancelled');

    if (allShifts) {
      const totalHours = allShifts.reduce((s, sh) => s + Number(sh.scheduled_hours || 0), 0);
      const totalCost = allShifts.reduce((s, sh) => s + Number(sh.scheduled_cost || 0), 0);
      await supabase
        .from('weekly_schedules')
        .update({ total_labor_hours: totalHours, total_labor_cost: totalCost, updated_at: new Date().toISOString() })
        .eq('id', validated.schedule_id);
    }

    return NextResponse.json({ success: true, shift: inserted });
  });
}

/** DELETE - Soft-delete a shift (cancel with reason) */
export async function DELETE(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':shift-delete');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(deleteShiftSchema, body);

    const supabase = await createClient();

    // Fetch original before cancelling
    const { data: original, error: fetchErr } = await supabase
      .from('shift_assignments')
      .select('*, employee:employees(first_name, last_name), position:positions(name), schedule:weekly_schedules(venue_id)')
      .eq('id', validated.shift_id)
      .single();

    if (fetchErr || !original) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Shift not found' };
    }

    // Soft delete - set status to cancelled
    const { data: updated, error: updateErr } = await supabase
      .from('shift_assignments')
      .update({
        status: 'cancelled',
        is_modified: true,
        modification_reason: `[Removed] ${validated.reason}`,
        modified_by: user.id,
        modified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.shift_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Log to manager_feedback
    await supabase.from('manager_feedback').insert({
      venue_id: original.schedule.venue_id,
      manager_id: user.id,
      feedback_type: 'override',
      business_date: original.business_date,
      original_recommendation: JSON.stringify({
        action: 'shift_scheduled',
        employee_id: original.employee_id,
        employee_name: original.employee ? `${original.employee.first_name} ${original.employee.last_name}` : null,
        position_name: original.position?.name,
        scheduled_hours: original.scheduled_hours,
      }),
      manager_decision: JSON.stringify({ action: 'shift_removed' }),
      reason: `[${validated.reason_category || 'Other'}] ${validated.reason}`,
    });

    // Recalculate schedule totals
    const { data: allShifts } = await supabase
      .from('shift_assignments')
      .select('scheduled_hours, scheduled_cost')
      .eq('schedule_id', original.schedule_id)
      .neq('status', 'cancelled');

    if (allShifts) {
      const totalHours = allShifts.reduce((s, sh) => s + Number(sh.scheduled_hours || 0), 0);
      const totalCost = allShifts.reduce((s, sh) => s + Number(sh.scheduled_cost || 0), 0);
      await supabase
        .from('weekly_schedules')
        .update({ total_labor_hours: totalHours, total_labor_cost: totalCost, updated_at: new Date().toISOString() })
        .eq('id', original.schedule_id);
    }

    return NextResponse.json({ success: true, shift: updated });
  });
}
