/**
 * Shift Monitoring Data Access Layer
 *
 * Provides typed access to mid-service thresholds, shift monitoring snapshots,
 * realtime adjustments, and active employee queries for the scheduling agent.
 * Follows sales-pace.ts patterns: service client, in-memory caching.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getTipseePool } from '@/lib/database/tipsee';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface MidServiceThresholds {
  cut_trigger_pct: number;
  callin_trigger_pct: number;
  target_splh: number;
  min_splh: number;
  max_splh: number;
  min_foh_count: number;
  min_boh_count: number;
  ot_warning_hours: number;
  weekly_ot_warning_hours: number;
  close_window_minutes: number;
  remaining_demand_cut_pct: number;
  pre_service_window_hours: number;
  is_active: boolean;
}

export interface ActiveEmployee {
  employeeId: string;
  employeeName: string;
  position: string;
  category: 'front_of_house' | 'back_of_house' | 'management';
  clockedInAt: string;
  hoursWorkedToday: number;
  hourlyRate: number;
  isCloser: boolean;
  scheduledEndTime: string | null;
}

export interface DemandInterval {
  interval_start: string;
  pct_of_daily_covers: number;
}

export interface MonitoringSnapshot {
  venue_id: string;
  business_date: string;
  shift_type: string;
  current_covers: number;
  current_revenue: number;
  current_staff_count: number;
  current_labor_cost: number;
  current_labor_hours: number;
  current_splh: number;
  remaining_demand_pct: number;
  forecasted_covers: number;
  variance_from_forecast: number;
  recommended_action: 'none' | 'cut_staff' | 'call_in_staff' | 'approaching_ot' | 'call_off';
  recommended_details: Record<string, unknown>;
}

export interface RecommendedAdjustment {
  venue_id: string;
  business_date: string;
  action_type: 'early_cut' | 'call_in' | 'extend_shift' | 'call_off';
  employee_id: string;
  employee_name: string;
  position: string;
  reason: string;
  covers_at_decision: number;
  forecast_covers: number;
  cost_savings: number;
  new_end_time?: string;
  monitoring_snapshot_id?: string;
}

export interface PendingAdjustment {
  id: string;
  venue_id: string;
  business_date: string;
  action_type: string;
  employee_id: string;
  employee_name: string;
  position: string;
  reason: string;
  covers_at_decision: number;
  forecast_covers: number;
  cost_savings: number;
  new_end_time: string | null;
  status: string;
  created_at: string;
}

export interface AdjustmentLookup {
  id: string;
  venue_id: string;
  status: string;
}

// ══════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_THRESHOLDS: MidServiceThresholds = {
  cut_trigger_pct: -15,
  callin_trigger_pct: 20,
  target_splh: 45,
  min_splh: 30,
  max_splh: 80,
  min_foh_count: 3,
  min_boh_count: 2,
  ot_warning_hours: 7,
  weekly_ot_warning_hours: 35,
  close_window_minutes: 90,
  remaining_demand_cut_pct: 0.15,
  pre_service_window_hours: 6,
  is_active: true,
};

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE (thresholds change infrequently)
// ══════════════════════════════════════════════════════════════════════════

const thresholdsCache = new Map<string, { data: MidServiceThresholds; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function isFresh(ts: number): boolean {
  return Date.now() - ts < CACHE_TTL_MS;
}

// ══════════════════════════════════════════════════════════════════════════
// THRESHOLDS
// ══════════════════════════════════════════════════════════════════════════

export async function getMidServiceThresholds(
  venueId: string
): Promise<MidServiceThresholds> {
  const cached = thresholdsCache.get(venueId);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('mid_service_thresholds')
    .select('*')
    .eq('venue_id', venueId)
    .single();

  if (error || !data) {
    // No venue-specific config — use defaults
    thresholdsCache.set(venueId, { data: DEFAULT_THRESHOLDS, ts: Date.now() });
    return DEFAULT_THRESHOLDS;
  }

  const thresholds: MidServiceThresholds = {
    cut_trigger_pct: Number(data.cut_trigger_pct),
    callin_trigger_pct: Number(data.callin_trigger_pct),
    target_splh: Number(data.target_splh),
    min_splh: Number(data.min_splh),
    max_splh: Number(data.max_splh),
    min_foh_count: Number(data.min_foh_count),
    min_boh_count: Number(data.min_boh_count),
    ot_warning_hours: Number(data.ot_warning_hours),
    weekly_ot_warning_hours: Number(data.weekly_ot_warning_hours),
    close_window_minutes: Number(data.close_window_minutes),
    remaining_demand_cut_pct: Number(data.remaining_demand_cut_pct),
    pre_service_window_hours: Number(data.pre_service_window_hours) || 6,
    is_active: Boolean(data.is_active),
  };

  thresholdsCache.set(venueId, { data: thresholds, ts: Date.now() });
  return thresholds;
}

// ══════════════════════════════════════════════════════════════════════════
// ACTIVE EMPLOYEES (currently on clock)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Fetch employees currently clocked in from TipSee 7shifts punches.
 * Only returns active punches (clocked_out IS NULL).
 */
export async function fetchActiveEmployees(
  locationUuid: string,
  date: string,
  venueCloseHour: number,
  closeWindowMinutes: number
): Promise<ActiveEmployee[]> {
  const pool = getTipseePool();

  try {
    const result = await pool.query(
      `SELECT
        p.user_id,
        COALESCE(p.user_first_name || ' ' || p.user_last_name, p.user_id::text) as employee_name,
        COALESCE(r.name, 'Unknown') as role_name,
        CASE
          WHEN d.name = 'FOH' THEN 'front_of_house'
          WHEN d.name = 'BOH' THEN 'back_of_house'
          ELSE 'management'
        END as category,
        p.clocked_in,
        EXTRACT(EPOCH FROM (NOW() - p.clocked_in)) / 3600 as hours_worked,
        CASE
          WHEN COALESCE(p.hourly_wage, 0) > 100 THEN COALESCE(p.hourly_wage, 0) / 100.0
          ELSE COALESCE(p.hourly_wage, 0)
        END as hourly_rate
      FROM public.tipsee_7shifts_punches p
      LEFT JOIN (SELECT DISTINCT ON (id) id, name FROM public.departments) d
        ON d.id = p.department_id
      LEFT JOIN (SELECT DISTINCT ON (id) id, name FROM public.roles) r
        ON r.id = p.role_id
      WHERE p.location_uuid = $1
        AND p.clocked_in::date = $2::date
        AND p.clocked_out IS NULL
        AND p.deleted IS NOT TRUE`,
      [locationUuid, date]
    );

    if (result.rows.length === 0) {
      // Fallback to new_tipsee_punches
      const fb = await pool.query(
        `SELECT
          p.user_id,
          COALESCE(p.user_first_name || ' ' || p.user_last_name, p.user_id::text) as employee_name,
          COALESCE(r.name, 'Unknown') as role_name,
          'front_of_house' as category,
          p.clocked_in,
          EXTRACT(EPOCH FROM (NOW() - p.clocked_in)) / 3600 as hours_worked,
          CASE
            WHEN COALESCE(w.wage_cents, 0) > 0 THEN COALESCE(w.wage_cents, 0) / 100.0
            ELSE 0
          END as hourly_rate
        FROM public.new_tipsee_punches p
        LEFT JOIN (SELECT DISTINCT ON (id) id, name FROM public.roles) r
          ON r.id = p.role_id
        LEFT JOIN LATERAL (
          SELECT wage_cents FROM public.new_tipsee_7shifts_users_wages
          WHERE user_id = p.user_id
            AND effective_date <= p.clocked_in::date
          ORDER BY effective_date DESC
          LIMIT 1
        ) w ON true
        WHERE p.location_uuid = $1
          AND p.clocked_in::date = $2::date
          AND p.clocked_out IS NULL
          AND p.is_deleted IS NOT TRUE`,
        [locationUuid, date]
      );

      return fb.rows.map((r: any) => mapEmployeeRow(r, venueCloseHour, closeWindowMinutes));
    }

    return result.rows.map((r: any) => mapEmployeeRow(r, venueCloseHour, closeWindowMinutes));
  } catch (error) {
    console.error('Error fetching active employees:', error);
    return [];
  }
}

function mapEmployeeRow(
  r: any,
  venueCloseHour: number,
  closeWindowMinutes: number
): ActiveEmployee {
  const roleName = (r.role_name || 'Unknown').toLowerCase();

  // Determine if this employee is a closer based on their role containing
  // typical closer keywords or if they were among the later arrivals
  // (simple heuristic — can be refined with shift_assignments join later)
  const isManagement = roleName.includes('manager') || roleName.includes('gm') ||
    roleName.includes('agm') || r.category === 'management';

  return {
    employeeId: String(r.user_id),
    employeeName: String(r.employee_name),
    position: String(r.role_name || 'Unknown'),
    category: r.category as ActiveEmployee['category'],
    clockedInAt: new Date(r.clocked_in).toISOString(),
    hoursWorkedToday: Number(r.hours_worked) || 0,
    hourlyRate: Number(r.hourly_rate) || 0,
    isCloser: false, // Set by the agent based on scheduled end time proximity
    scheduledEndTime: null, // Not available from punch data alone
  };
}

// ══════════════════════════════════════════════════════════════════════════
// DEMAND CURVES
// ══════════════════════════════════════════════════════════════════════════

export async function getDemandCurveForVenue(
  venueId: string,
  dayType: string
): Promise<DemandInterval[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('demand_distribution_curves')
    .select('interval_start, pct_of_daily_covers')
    .eq('venue_id', venueId)
    .eq('day_type', dayType)
    .order('interval_start');

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map((row: any) => ({
    interval_start: String(row.interval_start).substring(0, 5), // HH:MM
    pct_of_daily_covers: Number(row.pct_of_daily_covers),
  }));
}

// ══════════════════════════════════════════════════════════════════════════
// FORECAST
// ══════════════════════════════════════════════════════════════════════════

export async function getForecastForDate(
  venueId: string,
  businessDate: string
): Promise<{ covers_predicted: number; revenue_predicted: number } | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('forecasts_with_bias')
    .select('covers_predicted, revenue_predicted')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .order('forecast_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    covers_predicted: Number(data.covers_predicted) || 0,
    revenue_predicted: Number(data.revenue_predicted) || 0,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// MONITORING SNAPSHOTS
// ══════════════════════════════════════════════════════════════════════════

export async function storeMonitoringSnapshot(
  snapshot: MonitoringSnapshot
): Promise<string | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('shift_monitoring')
    .insert({
      venue_id: snapshot.venue_id,
      business_date: snapshot.business_date,
      shift_type: snapshot.shift_type,
      snapshot_time: new Date().toISOString(),
      current_covers: snapshot.current_covers,
      current_revenue: snapshot.current_revenue,
      current_staff_count: snapshot.current_staff_count,
      current_labor_cost: snapshot.current_labor_cost,
      current_labor_hours: snapshot.current_labor_hours,
      current_splh: snapshot.current_splh,
      remaining_demand_pct: snapshot.remaining_demand_pct,
      forecasted_covers: snapshot.forecasted_covers,
      variance_from_forecast: snapshot.variance_from_forecast,
      recommended_action: snapshot.recommended_action,
      recommended_details: snapshot.recommended_details,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to store monitoring snapshot:', error.message);
    return null;
  }

  return data?.id || null;
}

// ══════════════════════════════════════════════════════════════════════════
// REALTIME ADJUSTMENTS
// ══════════════════════════════════════════════════════════════════════════

export async function storeRecommendedAdjustments(
  adjustments: RecommendedAdjustment[]
): Promise<void> {
  if (adjustments.length === 0) return;

  const supabase = getServiceClient();
  const rows = adjustments.map((a) => ({
    venue_id: a.venue_id,
    business_date: a.business_date,
    action_type: a.action_type,
    employee_id: a.employee_id,
    employee_name: a.employee_name,
    position: a.position,
    reason: a.reason,
    covers_at_decision: a.covers_at_decision,
    forecast_covers: a.forecast_covers,
    cost_savings: a.cost_savings,
    new_end_time: a.new_end_time || null,
    monitoring_snapshot_id: a.monitoring_snapshot_id || null,
    status: 'pending',
  }));

  const { error } = await (supabase as any)
    .from('realtime_adjustments')
    .insert(rows);

  if (error) {
    console.error('Failed to store recommended adjustments:', error.message);
  }
}

export async function getPendingAdjustments(
  venueId: string,
  businessDate: string
): Promise<PendingAdjustment[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('realtime_adjustments')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch pending adjustments:', error.message);
    return [];
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    venue_id: r.venue_id,
    business_date: r.business_date,
    action_type: r.action_type,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    position: r.position,
    reason: r.reason,
    covers_at_decision: Number(r.covers_at_decision) || 0,
    forecast_covers: Number(r.forecast_covers) || 0,
    cost_savings: Number(r.cost_savings) || 0,
    new_end_time: r.new_end_time,
    status: r.status,
    created_at: r.created_at,
  }));
}

export async function executeAdjustment(
  adjustmentId: string,
  venueId: string,
  executedBy: string
): Promise<boolean> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('realtime_adjustments')
    .update({
      status: 'approved',
      executed_by: executedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', adjustmentId)
    .eq('venue_id', venueId)
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to execute adjustment:', error.message);
    return false;
  }
  return true;
}

export async function rejectAdjustment(
  adjustmentId: string,
  venueId: string,
  reason: string,
  rejectedBy: string
): Promise<boolean> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('realtime_adjustments')
    .update({
      status: 'rejected',
      executed_by: rejectedBy,
      rejected_reason: reason,
    })
    .eq('id', adjustmentId)
    .eq('venue_id', venueId)
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to reject adjustment:', error.message);
    return false;
  }
  return true;
}

export async function getAdjustmentById(
  adjustmentId: string,
): Promise<AdjustmentLookup | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('realtime_adjustments')
    .select('id, venue_id, status')
    .eq('id', adjustmentId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    venue_id: data.venue_id,
    status: data.status,
  };
}

/**
 * Expire stale pending adjustments (older than 30 minutes).
 * Called during each monitor cycle to prevent stale recommendations from piling up.
 */
export async function expireStaleAdjustments(
  venueId: string,
  businessDate: string
): Promise<void> {
  const supabase = getServiceClient();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  await (supabase as any)
    .from('realtime_adjustments')
    .update({ status: 'expired' })
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .eq('status', 'pending')
    .lt('created_at', thirtyMinAgo);
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-SERVICE: SCHEDULED SHIFTS
// ══════════════════════════════════════════════════════════════════════════

export interface ScheduledShiftRow {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  position: string;
  category: 'front_of_house' | 'back_of_house' | 'management';
  scheduledStart: string;
  scheduledEnd: string;
  scheduledHours: number;
  hourlyRate: number;
  shiftCost: number;
  status: string;
}

const POSITION_CATEGORIES: Record<string, 'front_of_house' | 'back_of_house' | 'management'> = {
  Server: 'front_of_house',
  Bartender: 'front_of_house',
  Host: 'front_of_house',
  Busser: 'front_of_house',
  'Food Runner': 'front_of_house',
  Barback: 'front_of_house',
  Cook: 'back_of_house',
  Prep: 'back_of_house',
  Dishwasher: 'back_of_house',
  Manager: 'management',
};

/**
 * Fetch scheduled shifts for a venue on a given business date.
 * Pulls from the latest published/draft weekly schedule's shift_assignments.
 */
export async function getScheduledShiftsForDate(
  venueId: string,
  businessDate: string
): Promise<ScheduledShiftRow[]> {
  const supabase = getServiceClient();

  // Get the latest schedule that covers this date
  const { data: shifts, error } = await (supabase as any)
    .from('shift_assignments')
    .select(`
      id,
      employee_id,
      position_id,
      business_date,
      scheduled_start,
      scheduled_end,
      scheduled_hours,
      hourly_rate,
      scheduled_cost,
      status,
      employees ( first_name, last_name ),
      positions ( name )
    `)
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .neq('status', 'cancelled');

  if (error || !shifts || shifts.length === 0) {
    return [];
  }

  return shifts.map((s: any) => {
    const posName = s.positions?.name || 'Unknown';
    const empName = s.employees
      ? `${s.employees.first_name || ''} ${s.employees.last_name || ''}`.trim()
      : 'Unknown';
    return {
      shiftId: s.id,
      employeeId: s.employee_id,
      employeeName: empName,
      position: posName,
      category: POSITION_CATEGORIES[posName] || 'front_of_house',
      scheduledStart: s.scheduled_start,
      scheduledEnd: s.scheduled_end,
      scheduledHours: Number(s.scheduled_hours) || 0,
      hourlyRate: Number(s.hourly_rate) || 0,
      shiftCost: Number(s.scheduled_cost) || 0,
      status: s.status,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-SERVICE: RESERVATION SUMMARY
// ══════════════════════════════════════════════════════════════════════════

export interface ReservationSummaryData {
  totalCovers: number;
  confirmedCovers: number;
  pendingCovers: number;
  reservationCount: number;
  peakHourCovers: number;
  peakHour: string;
}

/**
 * Get reservation summary for a venue on a given business date.
 * Aggregates party sizes from active (non-cancelled, non-noshow) reservations.
 */
export async function getReservationSummaryForDate(
  venueId: string,
  businessDate: string
): Promise<ReservationSummaryData> {
  const supabase = getServiceClient();
  const { data: reservations, error } = await (supabase as any)
    .from('reservations')
    .select('party_size, status, arrival_time')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .in('status', ['pending', 'confirmed', 'seated']);

  if (error || !reservations || reservations.length === 0) {
    return {
      totalCovers: 0,
      confirmedCovers: 0,
      pendingCovers: 0,
      reservationCount: 0,
      peakHourCovers: 0,
      peakHour: '00:00',
    };
  }

  let totalCovers = 0;
  let confirmedCovers = 0;
  let pendingCovers = 0;
  const hourBuckets = new Map<string, number>();

  for (const r of reservations) {
    const partySize = Number(r.party_size) || 0;
    totalCovers += partySize;
    if (r.status === 'confirmed' || r.status === 'seated') confirmedCovers += partySize;
    if (r.status === 'pending') pendingCovers += partySize;

    // Bucket by hour for peak detection
    if (r.arrival_time) {
      const hour = String(r.arrival_time).substring(0, 2) + ':00';
      hourBuckets.set(hour, (hourBuckets.get(hour) || 0) + partySize);
    }
  }

  let peakHourCovers = 0;
  let peakHour = '00:00';
  for (const [hour, covers] of hourBuckets) {
    if (covers > peakHourCovers) {
      peakHourCovers = covers;
      peakHour = hour;
    }
  }

  return {
    totalCovers,
    confirmedCovers,
    pendingCovers,
    reservationCount: reservations.length,
    peakHourCovers,
    peakHour,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-SERVICE: PREVIOUS FORECAST (for change detection)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get the previous day's forecast for the same business date.
 * Used to detect forecast changes that should trigger call-offs.
 */
export async function getPreviousForecast(
  venueId: string,
  businessDate: string
): Promise<number | null> {
  const supabase = getServiceClient();

  // Get the second-most-recent forecast for this date
  const { data, error } = await (supabase as any)
    .from('forecasts_with_bias')
    .select('covers_predicted, forecast_date')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .order('forecast_date', { ascending: false })
    .limit(2);

  if (error || !data || data.length < 2) return null;

  // Return the older forecast (index 1)
  return Number(data[1].covers_predicted) || null;
}
