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
  shape: 'round' | 'square' | 'rectangle' | 'bar_seat' | 'booth' | 'oval' | 'half_circle' | 'pullman';
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

export interface ShiftTableSplit {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  shift_type: string;
  employee_id: string;
  table_ids: string[];
  section_label: string;
  section_color: string;
  created_at: string;
  // Joined fields
  employee_name?: string;
  position_name?: string;
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

/**
 * Smart auto-assign: for each unassigned employee, find their most recent
 * section assignment on the same day-of-week + shift type (last 4 weeks).
 * Auto-creates those assignments so the floor plan pre-populates.
 * Returns the number of auto-assignments created.
 */
export async function autoAssignFromHistory(
  venueId: string,
  orgId: string,
  date: string,
  shiftType: string,
  unassignedEmployeeIds: string[],
): Promise<number> {
  if (unassignedEmployeeIds.length === 0) return 0;

  const supabase = getServiceClient();

  // Compute DOW (0=Sun, 6=Sat) for matching
  const dow = new Date(date + 'T12:00:00').getDay();

  // Look back 4 weeks for same DOW + shift type assignments
  const lookbackDate = new Date(date + 'T12:00:00');
  lookbackDate.setDate(lookbackDate.getDate() - 28);
  const lookbackStr = lookbackDate.toISOString().slice(0, 10);

  // Fetch recent assignments for these employees on the same DOW + shift
  const { data: recentAssignments, error } = await (supabase as any)
    .from('section_staff_assignments')
    .select('employee_id, section_id, business_date')
    .eq('venue_id', venueId)
    .eq('shift_type', shiftType)
    .in('employee_id', unassignedEmployeeIds)
    .gte('business_date', lookbackStr)
    .lt('business_date', date)
    .order('business_date', { ascending: false });

  if (error || !recentAssignments?.length) return 0;

  // For each employee, pick the most frequently assigned section
  const employeeSections = new Map<string, Map<string, number>>();
  for (const a of recentAssignments) {
    // Check DOW matches
    const aDate = new Date(a.business_date + 'T12:00:00');
    if (aDate.getDay() !== dow) continue;

    if (!employeeSections.has(a.employee_id)) {
      employeeSections.set(a.employee_id, new Map());
    }
    const counts = employeeSections.get(a.employee_id)!;
    counts.set(a.section_id, (counts.get(a.section_id) || 0) + 1);
  }

  // Verify sections still exist (active)
  const { data: activeSections } = await (supabase as any)
    .from('venue_sections')
    .select('id')
    .eq('venue_id', venueId)
    .eq('is_active', true);
  const activeSectionIds = new Set((activeSections || []).map((s: any) => s.id));

  let created = 0;
  for (const [employeeId, sectionCounts] of employeeSections) {
    // Pick section with highest count
    let bestSection = '';
    let bestCount = 0;
    for (const [sectionId, count] of sectionCounts) {
      if (count > bestCount && activeSectionIds.has(sectionId)) {
        bestSection = sectionId;
        bestCount = count;
      }
    }
    if (!bestSection) continue;

    // Auto-create the assignment
    try {
      await upsertStaffAssignment(venueId, orgId, {
        section_id: bestSection,
        employee_id: employeeId,
        business_date: date,
        shift_type: shiftType,
      });
      created++;
    } catch {
      // Skip on conflict — shouldn't happen but be safe
    }
  }

  return created;
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

// ══════════════════════════════════════════════════════════════════
// SHIFT TABLE SPLITS — Dynamic per-shift table assignments
// ══════════════════════════════════════════════════════════════════

const SPLIT_COLORS = [
  '#EF4444', '#3B82F6', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
];

/**
 * Pure function: auto-split tables into N groups using angular sweep.
 * Groups spatially adjacent tables together by computing each table's
 * angle from the centroid and splitting the sorted list evenly.
 */
export function autoSplitTables(
  tables: VenueTable[],
  serverCount: number,
): { label: string; color: string; table_ids: string[] }[] {
  if (serverCount <= 0 || tables.length === 0) return [];

  const n = Math.min(serverCount, tables.length);

  // Compute centroid
  const cx = tables.reduce((s, t) => s + t.pos_x + t.width / 2, 0) / tables.length;
  const cy = tables.reduce((s, t) => s + t.pos_y + t.height / 2, 0) / tables.length;

  // Compute angle from centroid for each table
  const withAngle = tables.map((t) => ({
    id: t.id,
    angle: Math.atan2(t.pos_y + t.height / 2 - cy, t.pos_x + t.width / 2 - cx),
    isBar: t.shape === 'bar_seat',
  }));

  // Separate bar seats — group them together as one section
  const barTables = withAngle.filter((t) => t.isBar);
  const floorTables = withAngle.filter((t) => !t.isBar);

  // Sort floor tables by angle
  floorTables.sort((a, b) => a.angle - b.angle);

  const groups: { label: string; color: string; table_ids: string[] }[] = [];

  // If there are bar seats and enough servers, give bar its own section
  const barGetsOwnSection = barTables.length > 0 && n > 1;
  const floorServerCount = barGetsOwnSection ? n - 1 : n;

  // Split floor tables into floorServerCount groups
  const perGroup = Math.ceil(floorTables.length / Math.max(1, floorServerCount));
  for (let i = 0; i < floorServerCount; i++) {
    const slice = floorTables.slice(i * perGroup, (i + 1) * perGroup);
    if (slice.length === 0) continue;
    groups.push({
      label: `Section ${groups.length + 1}`,
      color: SPLIT_COLORS[groups.length % SPLIT_COLORS.length],
      table_ids: slice.map((t) => t.id),
    });
  }

  // Add bar section
  if (barGetsOwnSection) {
    groups.push({
      label: 'Bar',
      color: SPLIT_COLORS[groups.length % SPLIT_COLORS.length],
      table_ids: barTables.map((t) => t.id),
    });
  } else if (barTables.length > 0 && groups.length > 0) {
    // Not enough servers for bar to be separate — add bar to last group
    groups[groups.length - 1].table_ids.push(...barTables.map((t) => t.id));
  }

  return groups;
}

/** Fetch existing shift splits for a venue/date/shift. */
export async function getShiftSplits(
  venueId: string,
  date: string,
  shiftType: string,
): Promise<ShiftTableSplit[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('shift_table_splits')
    .select('*, employee:employees(first_name, last_name, position:positions(name))')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType);

  if (error) {
    console.error('[floor-plan] Failed to fetch shift splits:', error.message);
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

/** Upsert a single shift split row. */
export async function upsertShiftSplit(
  venueId: string,
  orgId: string,
  split: {
    employee_id: string;
    table_ids: string[];
    section_label: string;
    section_color: string;
    business_date: string;
    shift_type: string;
  },
): Promise<ShiftTableSplit> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('shift_table_splits')
    .upsert(
      {
        venue_id: venueId,
        org_id: orgId,
        ...split,
      },
      { onConflict: 'venue_id,business_date,shift_type,employee_id' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Delete all splits for a venue/date/shift (for re-split). */
export async function deleteShiftSplits(
  venueId: string,
  date: string,
  shiftType: string,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('shift_table_splits')
    .delete()
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType);

  if (error) {
    console.error('[floor-plan] Failed to delete shift splits:', error.message);
    throw error;
  }
}

/** Move one table from one employee to another within a shift. */
export async function reassignTable(
  venueId: string,
  date: string,
  shiftType: string,
  tableId: string,
  fromEmployeeId: string,
  toEmployeeId: string,
): Promise<void> {
  const supabase = getServiceClient();

  // Remove from source
  const { data: fromRow } = await (supabase as any)
    .from('shift_table_splits')
    .select('id, table_ids')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType)
    .eq('employee_id', fromEmployeeId)
    .single();

  if (fromRow) {
    const newIds = (fromRow.table_ids as string[]).filter((id: string) => id !== tableId);
    await (supabase as any)
      .from('shift_table_splits')
      .update({ table_ids: newIds })
      .eq('id', fromRow.id);
  }

  // Add to target
  const { data: toRow } = await (supabase as any)
    .from('shift_table_splits')
    .select('id, table_ids')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType)
    .eq('employee_id', toEmployeeId)
    .single();

  if (toRow) {
    const newIds = [...(toRow.table_ids as string[]), tableId];
    await (supabase as any)
      .from('shift_table_splits')
      .update({ table_ids: newIds })
      .eq('id', toRow.id);
  }
}
