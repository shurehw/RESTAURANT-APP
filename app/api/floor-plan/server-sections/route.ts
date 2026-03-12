/**
 * Server Section Assignments
 *
 * GET  /api/floor-plan/server-sections?venue_id&date
 *   Returns section → server assignments for the date.
 *   Auto-generates from schedule (Server positions → sections round-robin)
 *   if no assignments exist yet.
 *
 * POST /api/floor-plan/server-sections
 *   Body: { venue_id, date, section_id, employee_id }
 *   Overrides a single section's assignment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';

interface SectionAssignment {
  section_id: string;
  section_name: string;
  section_color: string;
  employee_id: string | null;
  server_name: string | null;
  shift_assignment_id: string | null;
}

// ── GET ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get('venue_id');
    const date = searchParams.get('date');

    if (!venue_id || !date) {
      return NextResponse.json({ error: 'venue_id and date are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const supabase = getServiceClient();

    // Fetch all sections for this venue
    const { data: sections } = await (supabase as any)
      .from('venue_sections')
      .select('id, name, color')
      .eq('venue_id', venue_id)
      .order('sort_order', { ascending: true });

    if (!sections?.length) {
      return NextResponse.json({ assignments: [] });
    }

    // Fetch existing assignments for this date
    const { data: existing } = await (supabase as any)
      .from('server_section_assignments')
      .select('section_id, employee_id, shift_assignment_id, employees(first_name, last_name)')
      .eq('venue_id', venue_id)
      .eq('business_date', date);

    const existingMap = new Map<string, { employee_id: string; server_name: string; shift_assignment_id: string | null }>();
    for (const row of existing || []) {
      const emp = row.employees;
      existingMap.set(row.section_id, {
        employee_id: row.employee_id,
        server_name: emp ? `${emp.first_name} ${emp.last_name}`.trim() : 'Unknown',
        shift_assignment_id: row.shift_assignment_id,
      });
    }

    // If no assignments yet, auto-generate from schedule
    if (existingMap.size === 0) {
      const autoAssigned = await autoAssignFromSchedule(supabase, orgId, venue_id, date, sections);
      return NextResponse.json({ assignments: autoAssigned, auto_assigned: true });
    }

    // Build response
    const assignments: SectionAssignment[] = sections.map((s: any) => {
      const a = existingMap.get(s.id);
      return {
        section_id: s.id,
        section_name: s.name,
        section_color: s.color,
        employee_id: a?.employee_id ?? null,
        server_name: a?.server_name ?? null,
        shift_assignment_id: a?.shift_assignment_id ?? null,
      };
    });

    return NextResponse.json({ assignments });
  });
}

// ── POST ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, date, section_id, employee_id } = body;

    if (!venue_id || !date || !section_id || !employee_id) {
      return NextResponse.json({ error: 'venue_id, date, section_id, employee_id required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const supabase = getServiceClient();

    const { data, error } = await (supabase as any)
      .from('server_section_assignments')
      .upsert({
        org_id: orgId,
        venue_id,
        business_date: date,
        section_id,
        employee_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,business_date,section_id' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data });
  });
}

// ── Auto-assignment ───────────────────────────────────────────────────

async function autoAssignFromSchedule(
  supabase: any,
  orgId: string,
  venueId: string,
  date: string,
  sections: { id: string; name: string; color: string }[],
): Promise<SectionAssignment[]> {
  // Fetch Server shifts for this date (Server position, front_of_house category)
  const { data: serverShifts } = await supabase
    .from('shift_assignments')
    .select(`
      id,
      employee_id,
      employees(first_name, last_name),
      positions(name, category)
    `)
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('status', 'scheduled')
    .order('scheduled_start', { ascending: true });

  // Filter to Server positions only (name = 'Server', category = 'front_of_house')
  const servers = (serverShifts || []).filter((s: any) =>
    s.positions?.name === 'Server' && s.positions?.category === 'front_of_house'
  );

  const assignments: SectionAssignment[] = sections.map((s, i) => {
    const server = servers[i % Math.max(servers.length, 1)];
    return {
      section_id: s.id,
      section_name: s.name,
      section_color: s.color,
      employee_id: server?.employee_id ?? null,
      server_name: server?.employees
        ? `${server.employees.first_name} ${server.employees.last_name}`.trim()
        : null,
      shift_assignment_id: server?.id ?? null,
    };
  });

  // Persist auto-assignments so they show consistently
  if (servers.length > 0) {
    const rows = assignments
      .filter(a => a.employee_id)
      .map(a => ({
        org_id: orgId,
        venue_id: venueId,
        business_date: date,
        section_id: a.section_id,
        employee_id: a.employee_id,
        shift_assignment_id: a.shift_assignment_id,
      }));

    if (rows.length > 0) {
      await supabase
        .from('server_section_assignments')
        .upsert(rows, { onConflict: 'venue_id,business_date,section_id' });
    }
  }

  return assignments;
}
