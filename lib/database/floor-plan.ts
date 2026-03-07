/**
 * lib/database/floor-plan.ts
 * Data access layer for venue floor plans: sections, tables, and staff assignments.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export interface VenueSection {
  id: string;
  org_id: string;
  venue_id: string;
  name: string;
  color: string;
  sr_seating_area: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VenueTable {
  id: string;
  org_id: string;
  venue_id: string;
  section_id: string | null;
  table_number: string;
  min_capacity: number;
  max_capacity: number;
  shape: 'round' | 'square' | 'rectangle' | 'bar_seat' | 'booth' | 'oval';
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VenueLabel {
  id: string;
  org_id: string;
  venue_id: string;
  text: string;
  pos_x: number;
  pos_y: number;
  font_size: number;
  rotation: number;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SectionStaffAssignment {
  id: string;
  org_id: string;
  venue_id: string;
  section_id: string;
  employee_id: string;
  business_date: string;
  shift_type: string;
  assigned_by: string | null;
  created_at: string;
}

export interface FloorPlan {
  sections: VenueSection[];
  tables: VenueTable[];
  labels: VenueLabel[];
  assignments: (SectionStaffAssignment & {
    employee_name: string;
    position_name: string;
  })[];
}

// ── Sections ─────────────────────────────────────────────────────

export async function getSectionsForVenue(venueId: string): Promise<VenueSection[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_sections')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[floor-plan] Failed to fetch sections:', error.message);
    return [];
  }
  return data || [];
}

export async function upsertSection(
  venueId: string,
  orgId: string,
  section: Partial<Pick<VenueSection, 'id' | 'name' | 'color' | 'sr_seating_area' | 'sort_order'>>,
): Promise<VenueSection> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_sections')
    .upsert(
      {
        ...(section.id ? { id: section.id } : {}),
        venue_id: venueId,
        org_id: orgId,
        name: section.name,
        color: section.color || '#6B7280',
        sr_seating_area: section.sr_seating_area || null,
        sort_order: section.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: section.id ? 'id' : 'venue_id,name' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSection(sectionId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('venue_sections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', sectionId);

  if (error) {
    console.error('[floor-plan] Failed to delete section:', error.message);
    throw error;
  }
}

// ── Tables ───────────────────────────────────────────────────────

export async function getTablesForVenue(venueId: string): Promise<VenueTable[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_tables')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('table_number', { ascending: true });

  if (error) {
    console.error('[floor-plan] Failed to fetch tables:', error.message);
    return [];
  }
  return data || [];
}

export async function upsertTable(
  venueId: string,
  orgId: string,
  table: Partial<Pick<VenueTable, 'id' | 'table_number' | 'min_capacity' | 'max_capacity' | 'shape' | 'section_id' | 'pos_x' | 'pos_y' | 'width' | 'height' | 'rotation'>>,
): Promise<VenueTable> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_tables')
    .upsert(
      {
        ...(table.id ? { id: table.id } : {}),
        venue_id: venueId,
        org_id: orgId,
        table_number: table.table_number,
        min_capacity: table.min_capacity ?? 1,
        max_capacity: table.max_capacity ?? 4,
        shape: table.shape || 'round',
        section_id: table.section_id || null,
        pos_x: table.pos_x ?? 50,
        pos_y: table.pos_y ?? 50,
        width: table.width ?? 6,
        height: table.height ?? 6,
        rotation: table.rotation ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: table.id ? 'id' : 'venue_id,table_number' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function bulkUpdateTablePositions(
  updates: { id: string; pos_x: number; pos_y: number; width?: number; height?: number; rotation?: number; section_id?: string | null }[],
): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  // Batch update each table (Supabase doesn't support multi-row update in one call)
  await Promise.all(
    updates.map(({ id, ...fields }) =>
      (supabase as any)
        .from('venue_tables')
        .update({ ...fields, updated_at: now })
        .eq('id', id),
    ),
  );
}

export async function deleteTable(tableId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('venue_tables')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', tableId);

  if (error) {
    console.error('[floor-plan] Failed to delete table:', error.message);
    throw error;
  }
}

// ── Staff Assignments ────────────────────────────────────────────

export async function getStaffAssignments(
  venueId: string,
  date: string,
  shiftType: string,
): Promise<(SectionStaffAssignment & { employee_name: string; position_name: string })[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('section_staff_assignments')
    .select('*, employee:employees(first_name, last_name, primary_position_id, position:positions(name))')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType);

  if (error) {
    console.error('[floor-plan] Failed to fetch staff assignments:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...row,
    employee_name: row.employee
      ? `${row.employee.first_name} ${row.employee.last_name}`
      : 'Unknown',
    position_name: row.employee?.position?.name || 'Unknown',
    employee: undefined,
  }));
}

export async function upsertStaffAssignment(
  venueId: string,
  orgId: string,
  assignment: {
    section_id: string;
    employee_id: string;
    business_date: string;
    shift_type: string;
    assigned_by?: string;
  },
): Promise<SectionStaffAssignment> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('section_staff_assignments')
    .upsert(
      {
        venue_id: venueId,
        org_id: orgId,
        section_id: assignment.section_id,
        employee_id: assignment.employee_id,
        business_date: assignment.business_date,
        shift_type: assignment.shift_type,
        assigned_by: assignment.assigned_by || null,
      },
      { onConflict: 'venue_id,employee_id,business_date,shift_type' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeStaffAssignment(id: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('section_staff_assignments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[floor-plan] Failed to remove assignment:', error.message);
    throw error;
  }
}

export async function autoPopulateFromSchedule(
  venueId: string,
  date: string,
  shiftType: string,
): Promise<{ employee_id: string; employee_name: string; position_name: string }[]> {
  const supabase = getServiceClient();

  // Find the schedule for this date's week
  const { data: shifts, error } = await (supabase as any)
    .from('shift_assignments')
    .select('employee_id, employee:employees(first_name, last_name, primary_position_id, position:positions(name, category))')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType)
    .in('status', ['scheduled', 'confirmed']);

  if (error) {
    console.error('[floor-plan] Failed to fetch shifts for auto-populate:', error.message);
    return [];
  }

  // Filter to FOH positions only
  const fohShifts = (shifts || []).filter(
    (s: any) => s.employee?.position?.category === 'front_of_house',
  );

  return fohShifts.map((s: any) => ({
    employee_id: s.employee_id,
    employee_name: s.employee
      ? `${s.employee.first_name} ${s.employee.last_name}`
      : 'Unknown',
    position_name: s.employee?.position?.name || 'Unknown',
  }));
}

// ── Labels ──────────────────────────────────────────────────────

export async function getLabelsForVenue(venueId: string): Promise<VenueLabel[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_labels')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) {
    console.error('[floor-plan] Failed to fetch labels:', error.message);
    return [];
  }
  return data || [];
}

export async function upsertLabel(
  venueId: string,
  orgId: string,
  label: Partial<Pick<VenueLabel, 'id' | 'text' | 'pos_x' | 'pos_y' | 'font_size' | 'rotation' | 'color'>>,
): Promise<VenueLabel> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_labels')
    .upsert(
      {
        ...(label.id ? { id: label.id } : {}),
        venue_id: venueId,
        org_id: orgId,
        text: label.text,
        pos_x: label.pos_x ?? 50,
        pos_y: label.pos_y ?? 50,
        font_size: label.font_size ?? 14,
        rotation: label.rotation ?? 0,
        color: label.color || '#FFFFFF',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function bulkUpdateLabelPositions(
  updates: { id: string; pos_x: number; pos_y: number }[],
): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  await Promise.all(
    updates.map(({ id, ...fields }) =>
      (supabase as any)
        .from('venue_labels')
        .update({ ...fields, updated_at: now })
        .eq('id', id),
    ),
  );
}

export async function deleteLabel(labelId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('venue_labels')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', labelId);

  if (error) {
    console.error('[floor-plan] Failed to delete label:', error.message);
    throw error;
  }
}

// ── Full Floor Plan ──────────────────────────────────────────────

export async function getFloorPlanForVenue(
  venueId: string,
  date?: string,
  shiftType?: string,
): Promise<FloorPlan> {
  const [sections, tables, labels, assignments] = await Promise.all([
    getSectionsForVenue(venueId),
    getTablesForVenue(venueId),
    getLabelsForVenue(venueId),
    date && shiftType ? getStaffAssignments(venueId, date, shiftType) : Promise.resolve([]),
  ]);

  return { sections, tables, labels, assignments };
}

// ── Integration helper (replaces hardcoded VENUE_FLOOR_PLANS) ───

export async function getFloorPlanTableMap(
  venueId: string,
): Promise<Map<string, number>> {
  const tables = await getTablesForVenue(venueId);
  const map = new Map<string, number>();
  for (const t of tables) {
    map.set(t.table_number, t.max_capacity);
  }
  return map;
}
