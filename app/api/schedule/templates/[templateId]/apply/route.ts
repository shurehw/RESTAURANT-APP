import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { withIdempotency } from '@/lib/idempotency';
import { validate, uuid } from '@/lib/validate';
import { z } from 'zod';

const applyTemplateSchema = z.object({
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  schedule_id: uuid,
});

// POST /api/schedule/templates/[templateId]/apply - Apply template to week
export async function POST(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  return guard(async () => {
    rateLimit(request, ':template-apply');

    return withIdempotency(request, async () => {
      const user = await requireUser();
      const { venueIds, role } = await getUserOrgAndVenues(user.id);

      assertRole(role, ['owner', 'admin', 'manager']);

      const { templateId } = params;

      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId)) {
        throw {
          status: 400,
          code: 'INVALID_UUID',
          message: 'Invalid template ID format',
        };
      }

      const body = await request.json();
      const validated = validate(applyTemplateSchema, body);

      const supabase = await createClient();

      // Get template and verify venue access
      const { data: template, error: templateError } = await supabase
        .from('schedule_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;
      if (!template) {
        throw {
          status: 404,
          code: 'NOT_FOUND',
          message: 'Template not found',
        };
      }

      assertVenueAccess(template.venue_id, venueIds);

      // Parse template data
      const shifts = template.template_data as any[];

      // Calculate date offset
      const weekStart = new Date(validated.week_start_date);

      // Create shift assignments from template
      const shiftAssignments = shifts.map((shift: any) => {
        // Calculate actual date for this shift
        const shiftDate = new Date(weekStart);
        shiftDate.setDate(shiftDate.getDate() + shift.day_of_week);

        const startTime = new Date(`${shiftDate.toISOString().split('T')[0]}T${shift.start_time}`);
        const endTime = new Date(`${shiftDate.toISOString().split('T')[0]}T${shift.end_time}`);

        return {
          schedule_id: validated.schedule_id,
          employee_id: shift.employee_id,
          position_id: shift.position_id,
          scheduled_start: startTime.toISOString(),
          scheduled_end: endTime.toISOString(),
          scheduled_hours: shift.hours,
          shift_type: shift.shift_type,
          status: 'scheduled',
        };
      });

      // Insert all shift assignments
      const { data: insertedShifts, error: insertError } = await supabase
        .from('shift_assignments')
        .insert(shiftAssignments)
        .select();

      if (insertError) throw insertError;

      // Update template usage stats
      await supabase
        .from('schedule_templates')
        .update({
          last_used_at: new Date().toISOString(),
          use_count: template.use_count + 1,
        })
        .eq('id', templateId);

      return NextResponse.json({
        success: true,
        shifts_created: insertedShifts?.length || 0,
        shifts: insertedShifts,
      });
    });
  });
}
