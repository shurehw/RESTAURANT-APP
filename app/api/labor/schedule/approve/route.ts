import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { z } from 'zod';

const approveSchema = z.object({
  schedule_id: uuid,
  approval_notes: z.string().max(1000).optional(),
});

/** POST - Approve and publish a schedule */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':schedule-approve');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(approveSchema, body);

    // Use admin client to bypass RLS (auth already validated above via requireUser + assertRole)
    const supabase = createAdminClient();

    // Verify schedule exists and is in draft status
    const { data: schedule, error: schedErr } = await supabase
      .from('weekly_schedules')
      .select('id, status, venue_id')
      .eq('id', validated.schedule_id)
      .single();

    if (schedErr || !schedule) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Schedule not found' };
    }

    if (schedule.status === 'locked') {
      throw { status: 400, code: 'ALREADY_LOCKED', message: 'Schedule is already locked and cannot be modified' };
    }

    // Gather all modifications made to this schedule
    const { data: modifiedShifts } = await supabase
      .from('shift_assignments')
      .select('id, employee_id, position_id, business_date, shift_type, scheduled_hours, is_modified, modification_reason, modified_by, modified_at, status')
      .eq('schedule_id', validated.schedule_id)
      .eq('is_modified', true);

    const changesSummary = (modifiedShifts || []).map(s => ({
      shift_id: s.id,
      employee_id: s.employee_id,
      position_id: s.position_id,
      business_date: s.business_date,
      modification_reason: s.modification_reason,
      modified_by: s.modified_by,
      modified_at: s.modified_at,
      status: s.status,
    }));

    // Create approval record
    const { data: approval, error: approvalErr } = await supabase
      .from('schedule_approvals')
      .insert({
        schedule_id: validated.schedule_id,
        approved_by: user.id,
        approval_notes: validated.approval_notes || null,
        changes_made: changesSummary.length > 0 ? changesSummary : null,
        previous_status: schedule.status,
        new_status: 'published',
      })
      .select()
      .single();

    if (approvalErr) throw approvalErr;

    // Update schedule status to published
    const { data: updatedSchedule, error: updateErr } = await supabase
      .from('weekly_schedules')
      .update({
        status: 'published',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.schedule_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      schedule: updatedSchedule,
      approval,
      changes_count: changesSummary.length,
    });
  });
}
