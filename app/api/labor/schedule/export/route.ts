import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';
import * as XLSX from 'xlsx';

const exportQuerySchema = z.object({
  schedule_id: uuid.optional(),
  venue_id: uuid.optional(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  d => d.schedule_id || (d.venue_id && d.week_start),
  { message: 'Either schedule_id or venue_id + week_start required' }
);

/** GET - Export schedule as Excel file */
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':schedule-export');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const params = validateQuery(exportQuerySchema, request.nextUrl.searchParams);

    const supabase = await createClient();

    // Fetch schedule with all relations
    let query = supabase
      .from('weekly_schedules')
      .select(`
        *,
        shifts:shift_assignments(
          *,
          employee:employees(first_name, last_name, email),
          position:positions(name, category, base_hourly_rate)
        )
      `);

    if (params.schedule_id) {
      query = query.eq('id', params.schedule_id);
    } else {
      query = query.eq('venue_id', params.venue_id!).eq('week_start_date', params.week_start!);
    }

    const { data: schedule, error } = await query.single();
    if (error || !schedule) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Schedule not found' };
    }

    assertVenueAccess(schedule.venue_id, venueIds);

    // Get venue name for the filename
    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', schedule.venue_id)
      .single();

    const venueName = venue?.name || 'Schedule';

    // Build export data rows
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const shifts = (schedule.shifts || [])
      .filter((s: any) => s.status !== 'cancelled')
      .sort((a: any, b: any) => {
        if (a.business_date !== b.business_date) return a.business_date.localeCompare(b.business_date);
        if (a.position?.name !== b.position?.name) return (a.position?.name || '').localeCompare(b.position?.name || '');
        return (a.scheduled_start || '').localeCompare(b.scheduled_start || '');
      });

    const exportData = shifts.map((shift: any) => {
      const date = new Date(shift.business_date + 'T00:00:00');
      const dayName = dayNames[date.getDay()];
      const employeeName = shift.employee
        ? `${shift.employee.first_name} ${shift.employee.last_name}`
        : 'Unassigned';

      return {
        'Date': shift.business_date,
        'Day': dayName,
        'Employee': employeeName,
        'Email': shift.employee?.email || '',
        'Position': shift.position?.name || 'Unknown',
        'Category': shift.position?.category || '',
        'Shift Type': shift.shift_type,
        'Start Time': formatExportTime(shift.scheduled_start),
        'End Time': formatExportTime(shift.scheduled_end),
        'Hours': Number(shift.scheduled_hours),
        'Hourly Rate': Number(shift.hourly_rate || shift.position?.base_hourly_rate || 0),
        'Cost': Number(shift.scheduled_cost || (shift.scheduled_hours * (shift.hourly_rate || shift.position?.base_hourly_rate || 0))),
        'Status': shift.status,
        'Modified': shift.is_modified ? 'Yes' : 'No',
        'Modification Reason': shift.modification_reason || '',
      };
    });

    // Create Excel workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');

    // Add summary sheet
    const summaryData = [
      { 'Metric': 'Week', 'Value': `${schedule.week_start_date} to ${schedule.week_end_date}` },
      { 'Metric': 'Status', 'Value': schedule.status },
      { 'Metric': 'Total Shifts', 'Value': shifts.length },
      { 'Metric': 'Total Hours', 'Value': Number(schedule.total_labor_hours || 0) },
      { 'Metric': 'Total Labor Cost', 'Value': `$${Number(schedule.total_labor_cost || 0).toFixed(2)}` },
      { 'Metric': 'Modifications', 'Value': shifts.filter((s: any) => s.is_modified).length },
      { 'Metric': 'Generated', 'Value': schedule.generated_at || schedule.created_at },
      { 'Metric': 'Approved By', 'Value': schedule.approved_by || 'Not yet approved' },
    ];

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 12 }, // Date
      { wch: 10 }, // Day
      { wch: 22 }, // Employee
      { wch: 25 }, // Email
      { wch: 18 }, // Position
      { wch: 12 }, // Category
      { wch: 12 }, // Shift Type
      { wch: 12 }, // Start Time
      { wch: 12 }, // End Time
      { wch: 8 },  // Hours
      { wch: 12 }, // Hourly Rate
      { wch: 10 }, // Cost
      { wch: 12 }, // Status
      { wch: 10 }, // Modified
      { wch: 30 }, // Modification Reason
    ];

    summarySheet['!cols'] = [
      { wch: 20 },
      { wch: 40 },
    ];

    // Convert to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const safeName = venueName.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `schedule-${safeName}-${schedule.week_start_date}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });
}

function formatExportTime(timeStr: string | null): string {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    const date = new Date(timeStr);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${hour12}:${minutes} ${ampm}`;
  }
  return timeStr;
}
