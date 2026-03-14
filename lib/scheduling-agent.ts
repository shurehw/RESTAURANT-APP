/**
 * Scheduling Agent — Core Decision Engine
 *
 * Pure logic, no database imports. Takes typed inputs, returns typed outputs.
 * Two phases:
 *   1. PRE-SERVICE — forecast + reservations vs scheduled shifts → call-offs/call-ins
 *   2. MID-SERVICE — live covers vs forecast → early cuts/call-ins/OT risk
 *
 * The rules are always on. Calibration is allowed. Escape is not.
 */

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface DemandInterval {
  interval_start: string; // HH:MM
  pct_of_daily_covers: number;
}

export interface ActiveEmployee {
  employeeId: string;
  employeeName: string;
  position: string;
  category: 'front_of_house' | 'back_of_house' | 'management';
  clockedInAt: string; // ISO timestamp
  hoursWorkedToday: number;
  hourlyRate: number;
  isCloser: boolean;
  scheduledEndTime: string | null; // HH:MM
}

export interface MidServiceThresholds {
  cut_trigger_pct: number;       // e.g. -15 (negative = below forecast)
  callin_trigger_pct: number;    // e.g. 20 (positive = above forecast)
  target_splh: number;
  min_splh: number;
  max_splh: number;
  min_foh_count: number;
  min_boh_count: number;
  ot_warning_hours: number;
  weekly_ot_warning_hours: number;
  close_window_minutes: number;
  remaining_demand_cut_pct: number;
}

export interface MonitoringInput {
  venueId: string;
  businessDate: string;
  currentTimeLocal: string; // HH:MM (24h)
  venueOpenHour: number;    // e.g. 17 for 5 PM
  venueCloseHour: number;   // e.g. 2 for 2 AM (next day)

  // Live POS state
  currentCovers: number;
  currentRevenue: number;
  currentLaborCost: number;
  currentLaborHours: number;

  // Forecast
  forecastedDailyCovers: number;
  demandCurve: DemandInterval[];

  // Active staff
  activeEmployees: ActiveEmployee[];

  // Thresholds
  thresholds: MidServiceThresholds;
}

export type RecommendedAction = 'none' | 'cut_staff' | 'call_in_staff' | 'approaching_ot';

export interface MonitoringOutput {
  snapshot: {
    current_covers: number;
    current_revenue: number;
    current_staff_count: number;
    current_labor_cost: number;
    current_labor_hours: number;
    current_splh: number;
    forecasted_covers_at_this_point: number;
    variance_pct: number;
    remaining_demand_pct: number;
    recommended_action: RecommendedAction;
    recommended_details: Record<string, unknown>;
  };
  adjustments: AdjustmentRecommendation[];
}

export interface AdjustmentRecommendation {
  action_type: 'early_cut' | 'call_in' | 'extend_shift' | 'call_off';
  employeeId: string;
  employeeName: string;
  position: string;
  reason: string;
  priority: number; // 1 = highest
  estimatedSavings: number;
  newEndTime?: string;
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-SERVICE TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface ScheduledShift {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  position: string;
  category: 'front_of_house' | 'back_of_house' | 'management';
  scheduledStart: string; // ISO timestamp
  scheduledEnd: string;
  scheduledHours: number;
  hourlyRate: number;
  shiftCost: number;
  status: string; // 'scheduled' | 'confirmed' | 'cancelled'
}

export interface ReservationSummary {
  totalCovers: number;        // sum of party_size for confirmed/pending rezs
  confirmedCovers: number;    // only confirmed status
  pendingCovers: number;      // pending status
  reservationCount: number;
  peakHourCovers: number;     // max covers in any single hour
  peakHour: string;           // HH:MM of peak
}

export interface PreServiceInput {
  venueId: string;
  businessDate: string;
  currentTimeLocal: string;   // HH:MM
  venueOpenHour: number;
  venueCloseHour: number;
  hoursUntilService: number;  // hours until venue opens

  // Forecast
  forecastedDailyCovers: number;
  previousForecastCovers: number | null; // yesterday's forecast for same date (to detect changes)

  // Reservation signal
  reservations: ReservationSummary;

  // Scheduled staff for tonight
  scheduledShifts: ScheduledShift[];

  // Thresholds
  thresholds: MidServiceThresholds;
}

export interface PreServiceOutput {
  phase: 'pre_service';
  forecastedCovers: number;
  reservationCovers: number;
  scheduledStaffCount: number;
  scheduledLaborCost: number;
  forecastChangePct: number | null;   // vs previous forecast
  rezVsForecastPct: number;           // rez covers as % of forecast
  recommended_action: RecommendedAction | 'call_off';
  recommended_details: Record<string, unknown>;
  adjustments: AdjustmentRecommendation[];
}

// ══════════════════════════════════════════════════════════════════════════
// TIME HELPERS
// ══════════════════════════════════════════════════════════════════════════

/** Parse "HH:MM" to minutes since midnight */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Normalize minutes to handle midnight-crossing venues.
 * For a venue open at 17:00 closing at 02:00, intervals after midnight
 * (00:00-02:00) should sort AFTER 23:30.
 */
function normalizeMinutes(minutes: number, venueOpenHour: number): number {
  const openMinutes = venueOpenHour * 60;
  // If the interval is before the open hour, it's after midnight
  if (minutes < openMinutes && venueOpenHour >= 12) {
    return minutes + 24 * 60;
  }
  return minutes;
}

// ══════════════════════════════════════════════════════════════════════════
// DEMAND CURVE ANALYSIS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Calculate expected covers at the current time using the demand distribution curve.
 * Sums pct_of_daily_covers for all intervals up to and including the current time.
 */
export function getExpectedCoversAtTime(
  curve: DemandInterval[],
  currentTimeLocal: string,
  forecastedDailyCovers: number,
  venueOpenHour: number
): { expectedCovers: number; remainingPct: number } {
  if (curve.length === 0 || forecastedDailyCovers <= 0) {
    return { expectedCovers: 0, remainingPct: 1.0 };
  }

  const currentMinutesRaw = parseTimeToMinutes(currentTimeLocal);
  const currentMinutesNorm = normalizeMinutes(currentMinutesRaw, venueOpenHour);

  let cumulativePct = 0;
  let totalPct = 0;

  for (const interval of curve) {
    const intervalMinutesRaw = parseTimeToMinutes(interval.interval_start);
    const intervalMinutesNorm = normalizeMinutes(intervalMinutesRaw, venueOpenHour);
    totalPct += interval.pct_of_daily_covers;

    if (intervalMinutesNorm <= currentMinutesNorm) {
      cumulativePct += interval.pct_of_daily_covers;
    }
  }

  // If total curve doesn't sum to ~1.0, normalize
  const normalizedCumulative = totalPct > 0 ? cumulativePct / totalPct : cumulativePct;

  return {
    expectedCovers: Math.round(forecastedDailyCovers * normalizedCumulative),
    remainingPct: Math.max(0, 1.0 - normalizedCumulative),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// CUT CANDIDATE SELECTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Select cut candidates using LIFO with protections:
 * 1. Filter out management
 * 2. Filter out closers (within close window of venue close)
 * 3. Respect min FOH/BOH staffing floors
 * 4. Sort by clockedInAt DESC (most recently arrived = first to cut)
 */
export function getCutCandidates(
  employees: ActiveEmployee[],
  thresholds: MidServiceThresholds,
  currentTimeLocal: string,
  venueCloseHour: number,
  venueOpenHour: number
): ActiveEmployee[] {
  const currentMinutes = normalizeMinutes(
    parseTimeToMinutes(currentTimeLocal),
    venueOpenHour
  );
  const closeMinutes = normalizeMinutes(venueCloseHour * 60, venueOpenHour);
  const closeWindowStart = closeMinutes - thresholds.close_window_minutes;

  // Count current FOH and BOH
  const fohCount = employees.filter((e) => e.category === 'front_of_house').length;
  const bohCount = employees.filter((e) => e.category === 'back_of_house').length;

  // Track how many we can cut per category
  let fohCuttable = Math.max(0, fohCount - thresholds.min_foh_count);
  let bohCuttable = Math.max(0, bohCount - thresholds.min_boh_count);

  const candidates = employees
    .filter((e) => {
      // Never cut management
      if (e.category === 'management') return false;
      // Never cut closers within close protection window
      if (e.isCloser && currentMinutes >= closeWindowStart) return false;
      return true;
    })
    // LIFO: most recently clocked in first
    .sort((a, b) => new Date(b.clockedInAt).getTime() - new Date(a.clockedInAt).getTime())
    .filter((e) => {
      // Respect category minimums
      if (e.category === 'front_of_house') {
        if (fohCuttable <= 0) return false;
        fohCuttable--;
        return true;
      }
      if (e.category === 'back_of_house') {
        if (bohCuttable <= 0) return false;
        bohCuttable--;
        return true;
      }
      return true;
    });

  return candidates;
}

// ══════════════════════════════════════════════════════════════════════════
// OT RISK DETECTION
// ══════════════════════════════════════════════════════════════════════════

function getOtRiskEmployees(
  employees: ActiveEmployee[],
  warningHours: number
): ActiveEmployee[] {
  return employees.filter((e) => e.hoursWorkedToday >= warningHours);
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN DECISION ENGINE
// ══════════════════════════════════════════════════════════════════════════

export function evaluateStaffingState(input: MonitoringInput): MonitoringOutput {
  const {
    currentCovers,
    currentRevenue,
    currentLaborCost,
    currentLaborHours,
    forecastedDailyCovers,
    demandCurve,
    currentTimeLocal,
    venueOpenHour,
    venueCloseHour,
    activeEmployees,
    thresholds,
  } = input;

  // ── Step 1: Calculate expected covers at this point in service ──────────
  const { expectedCovers, remainingPct } = getExpectedCoversAtTime(
    demandCurve,
    currentTimeLocal,
    forecastedDailyCovers,
    venueOpenHour
  );

  // ── Step 2: Variance calculation ────────────────────────────────────────
  const variancePct =
    expectedCovers > 0
      ? ((currentCovers - expectedCovers) / expectedCovers) * 100
      : 0;

  // ── Step 3: SPLH calculation ────────────────────────────────────────────
  const currentSPLH = currentLaborHours > 0 ? currentRevenue / currentLaborHours : 0;

  // ── Step 4: Staff counts ────────────────────────────────────────────────
  const staffCount = activeEmployees.length;

  // ── Step 5: Decision matrix ─────────────────────────────────────────────
  let recommendedAction: RecommendedAction = 'none';
  const adjustments: AdjustmentRecommendation[] = [];
  const details: Record<string, unknown> = {};

  // Check OT risk first (always flagged regardless of demand)
  const otRisk = getOtRiskEmployees(activeEmployees, thresholds.ot_warning_hours);
  if (otRisk.length > 0) {
    recommendedAction = 'approaching_ot';
    details.ot_risk_employees = otRisk.map((e) => ({
      name: e.employeeName,
      position: e.position,
      hours_worked: Math.round(e.hoursWorkedToday * 100) / 100,
      projected_ot_cost:
        Math.round(e.hourlyRate * 0.5 * Math.max(0, e.hoursWorkedToday - 8) * 100) / 100,
    }));

    otRisk.forEach((e, i) => {
      adjustments.push({
        action_type: 'early_cut',
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        position: e.position,
        reason: `Approaching OT: ${Math.round(e.hoursWorkedToday * 10) / 10}h worked (threshold: ${thresholds.ot_warning_hours}h)`,
        priority: i + 1,
        estimatedSavings: Math.round(e.hourlyRate * 1.5 * 100) / 100, // 1h of OT pay avoided
      });
    });
  }

  // Check demand variance — covers trending below forecast
  if (
    variancePct <= thresholds.cut_trigger_pct &&
    remainingPct < thresholds.remaining_demand_cut_pct
  ) {
    // Only upgrade to cut_staff if not already flagging OT (OT is more urgent)
    if (recommendedAction === 'none') {
      recommendedAction = 'cut_staff';
    }

    const candidates = getCutCandidates(
      activeEmployees,
      thresholds,
      currentTimeLocal,
      venueCloseHour,
      venueOpenHour
    );

    // Recommend cutting up to the number that would bring SPLH back to target
    const targetCuts = currentSPLH > 0 && thresholds.target_splh > 0
      ? Math.ceil((thresholds.target_splh - currentSPLH) / (currentSPLH / Math.max(1, staffCount)) * -1)
      : 1;
    const cutsToMake = Math.min(candidates.length, Math.max(1, targetCuts));

    details.demand_variance = {
      expected_covers: expectedCovers,
      actual_covers: currentCovers,
      variance_pct: Math.round(variancePct * 10) / 10,
      remaining_demand_pct: Math.round(remainingPct * 1000) / 10,
      candidates_available: candidates.length,
      cuts_recommended: cutsToMake,
    };

    candidates.slice(0, cutsToMake).forEach((e, i) => {
      // Estimate remaining hours if not cut
      const remainingHours = Math.max(1, 2); // Approximate 2h remaining
      adjustments.push({
        action_type: 'early_cut',
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        position: e.position,
        reason: `Covers ${Math.round(Math.abs(variancePct))}% below forecast (${currentCovers} actual vs ${expectedCovers} expected). ${Math.round(remainingPct * 100)}% demand remaining.`,
        priority: adjustments.length + 1,
        estimatedSavings: Math.round(e.hourlyRate * remainingHours * 100) / 100,
      });
    });
  }

  // Check SPLH-driven cuts (even if variance isn't extreme, SPLH may be too low)
  if (
    recommendedAction === 'none' &&
    currentSPLH > 0 &&
    currentSPLH < thresholds.min_splh &&
    remainingPct < 0.3
  ) {
    recommendedAction = 'cut_staff';
    const candidates = getCutCandidates(
      activeEmployees,
      thresholds,
      currentTimeLocal,
      venueCloseHour,
      venueOpenHour
    );

    details.splh_driven = {
      current_splh: Math.round(currentSPLH * 100) / 100,
      min_splh: thresholds.min_splh,
      target_splh: thresholds.target_splh,
      candidates_available: candidates.length,
    };

    if (candidates.length > 0) {
      const e = candidates[0];
      adjustments.push({
        action_type: 'early_cut',
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        position: e.position,
        reason: `SPLH at $${Math.round(currentSPLH)} (min: $${thresholds.min_splh}). Reducing staff to improve labor efficiency.`,
        priority: adjustments.length + 1,
        estimatedSavings: Math.round(e.hourlyRate * 2 * 100) / 100,
      });
    }
  }

  // Check demand variance — covers trending above forecast (need call-ins)
  if (variancePct >= thresholds.callin_trigger_pct && remainingPct > 0.2) {
    if (recommendedAction === 'none') {
      recommendedAction = 'call_in_staff';
    }

    // Identify which category is most strained
    const fohOnFloor = activeEmployees.filter((e) => e.category === 'front_of_house').length;
    const bohOnFloor = activeEmployees.filter((e) => e.category === 'back_of_house').length;

    details.call_in = {
      expected_covers: expectedCovers,
      actual_covers: currentCovers,
      variance_pct: Math.round(variancePct * 10) / 10,
      remaining_demand_pct: Math.round(remainingPct * 1000) / 10,
      current_foh: fohOnFloor,
      current_boh: bohOnFloor,
      positions_needed: fohOnFloor <= bohOnFloor ? ['Server', 'Busser'] : ['Cook', 'Prep'],
    };

    // Recommend call-in (no specific employee — manager picks)
    adjustments.push({
      action_type: 'call_in',
      employeeId: '', // Manager selects
      employeeName: 'TBD',
      position: fohOnFloor <= bohOnFloor ? 'Server' : 'Cook',
      reason: `Covers ${Math.round(variancePct)}% above forecast (${currentCovers} actual vs ${expectedCovers} expected). ${Math.round(remainingPct * 100)}% demand remaining.`,
      priority: 1,
      estimatedSavings: 0, // Call-ins cost money, not save it
    });
  }

  return {
    snapshot: {
      current_covers: currentCovers,
      current_revenue: currentRevenue,
      current_staff_count: staffCount,
      current_labor_cost: currentLaborCost,
      current_labor_hours: currentLaborHours,
      current_splh: Math.round(currentSPLH * 100) / 100,
      forecasted_covers_at_this_point: expectedCovers,
      variance_pct: Math.round(variancePct * 100) / 100,
      remaining_demand_pct: Math.round(remainingPct * 1000) / 1000,
      recommended_action: recommendedAction,
      recommended_details: details,
    },
    adjustments,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-SERVICE DECISION ENGINE
// ══════════════════════════════════════════════════════════════════════════

/**
 * Pre-service staffing evaluation.
 *
 * Runs hours before service starts. Compares:
 *   - Latest forecast covers (and whether it changed from yesterday)
 *   - Actual reservation covers on the books
 *   - Scheduled shift count from the published schedule
 *
 * Recommends call-offs when demand signals are significantly below
 * what's scheduled, and call-ins when above.
 */
export function evaluatePreServiceState(input: PreServiceInput): PreServiceOutput {
  const {
    forecastedDailyCovers,
    previousForecastCovers,
    reservations,
    scheduledShifts,
    thresholds,
  } = input;

  const activeShifts = scheduledShifts.filter((s) => s.status !== 'cancelled');
  const scheduledStaffCount = activeShifts.length;
  const scheduledLaborCost = activeShifts.reduce((sum, s) => sum + s.shiftCost, 0);

  // ── Forecast change detection ────────────────────────────────────────
  const forecastChangePct =
    previousForecastCovers && previousForecastCovers > 0
      ? ((forecastedDailyCovers - previousForecastCovers) / previousForecastCovers) * 100
      : null;

  // ── Reservation vs forecast comparison ───────────────────────────────
  // Rez covers are a strong leading indicator of actual demand
  const rezVsForecastPct =
    forecastedDailyCovers > 0
      ? (reservations.totalCovers / forecastedDailyCovers) * 100
      : 0;

  // ── Demand signal: weighted blend of forecast + rez reality ──────────
  // If rezs are on the books, weight them more heavily than the forecast
  // Rez weight increases as we get closer to service (more signal, less noise)
  const rezWeight = input.hoursUntilService <= 2 ? 0.6 : input.hoursUntilService <= 4 ? 0.4 : 0.25;
  const blendedCovers = reservations.totalCovers > 0
    ? Math.round(forecastedDailyCovers * (1 - rezWeight) + (reservations.totalCovers / rezCoverageRatio(reservations)) * rezWeight)
    : forecastedDailyCovers;

  // ── Compare blended demand vs scheduled capacity ─────────────────────
  // Use a simple covers-per-server target to estimate needed staff
  const coversPerServer = 20; // Industry avg — could pull from CPLH later
  const estimatedFohNeeded = Math.max(thresholds.min_foh_count, Math.ceil(blendedCovers / coversPerServer));
  const fohScheduled = activeShifts.filter((s) => s.category === 'front_of_house').length;
  const bohScheduled = activeShifts.filter((s) => s.category === 'back_of_house').length;

  let recommendedAction: RecommendedAction | 'call_off' = 'none';
  const adjustments: AdjustmentRecommendation[] = [];
  const details: Record<string, unknown> = {};

  // ── CALL-OFF: forecast dropped significantly or rezs way below scheduled ──
  const shouldCallOff =
    (forecastChangePct !== null && forecastChangePct <= thresholds.cut_trigger_pct) ||
    (rezVsForecastPct < 50 && reservations.totalCovers > 0 && input.hoursUntilService <= 4) ||
    (fohScheduled > estimatedFohNeeded + 1);

  if (shouldCallOff && fohScheduled > thresholds.min_foh_count) {
    recommendedAction = 'call_off';
    const excessFoh = Math.max(0, fohScheduled - estimatedFohNeeded);
    const excessBoh = blendedCovers < forecastedDailyCovers * 0.7
      ? Math.max(0, bohScheduled - thresholds.min_boh_count - 1) // Keep 1 buffer for BOH
      : 0;

    details.pre_service_call_off = {
      forecasted_covers: forecastedDailyCovers,
      blended_demand: blendedCovers,
      reservation_covers: reservations.totalCovers,
      rez_vs_forecast_pct: Math.round(rezVsForecastPct),
      forecast_change_pct: forecastChangePct !== null ? Math.round(forecastChangePct * 10) / 10 : null,
      foh_scheduled: fohScheduled,
      foh_needed: estimatedFohNeeded,
      excess_foh: excessFoh,
      excess_boh: excessBoh,
      hours_until_service: input.hoursUntilService,
    };

    // Select call-off candidates: latest shift start first (LIFO by scheduled start)
    const fohCandidates = activeShifts
      .filter((s) => s.category === 'front_of_house' && s.status !== 'cancelled')
      .sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());

    fohCandidates.slice(0, excessFoh).forEach((s, i) => {
      adjustments.push({
        action_type: 'call_off',
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        position: s.position,
        reason: buildCallOffReason(forecastChangePct, rezVsForecastPct, reservations.totalCovers, forecastedDailyCovers),
        priority: i + 1,
        estimatedSavings: s.shiftCost,
      });
    });

    // BOH call-offs if demand is very low
    if (excessBoh > 0) {
      const bohCandidates = activeShifts
        .filter((s) => s.category === 'back_of_house' && s.status !== 'cancelled')
        .sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());

      bohCandidates.slice(0, excessBoh).forEach((s) => {
        adjustments.push({
          action_type: 'call_off',
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          position: s.position,
          reason: buildCallOffReason(forecastChangePct, rezVsForecastPct, reservations.totalCovers, forecastedDailyCovers),
          priority: adjustments.length + 1,
          estimatedSavings: s.shiftCost,
        });
      });
    }
  }

  // ── CALL-IN: rezs surging above forecast ──────────────────────────────
  const shouldCallIn =
    (forecastChangePct !== null && forecastChangePct >= thresholds.callin_trigger_pct) ||
    (rezVsForecastPct > 120 && reservations.totalCovers > 0) ||
    (estimatedFohNeeded > fohScheduled + 1);

  if (shouldCallIn && recommendedAction === 'none') {
    recommendedAction = 'call_in_staff';
    const additionalNeeded = Math.max(1, estimatedFohNeeded - fohScheduled);

    details.pre_service_call_in = {
      forecasted_covers: forecastedDailyCovers,
      blended_demand: blendedCovers,
      reservation_covers: reservations.totalCovers,
      rez_vs_forecast_pct: Math.round(rezVsForecastPct),
      forecast_change_pct: forecastChangePct !== null ? Math.round(forecastChangePct * 10) / 10 : null,
      foh_scheduled: fohScheduled,
      foh_needed: estimatedFohNeeded,
      additional_needed: additionalNeeded,
      hours_until_service: input.hoursUntilService,
    };

    for (let i = 0; i < additionalNeeded; i++) {
      adjustments.push({
        action_type: 'call_in',
        employeeId: '',
        employeeName: 'TBD',
        position: 'Server',
        reason: `Demand signal ${Math.round(rezVsForecastPct)}% of forecast (${reservations.totalCovers} rez covers vs ${forecastedDailyCovers} forecast). ${additionalNeeded} additional FOH needed.`,
        priority: i + 1,
        estimatedSavings: 0,
      });
    }
  }

  return {
    phase: 'pre_service',
    forecastedCovers: forecastedDailyCovers,
    reservationCovers: reservations.totalCovers,
    scheduledStaffCount,
    scheduledLaborCost,
    forecastChangePct,
    rezVsForecastPct: Math.round(rezVsForecastPct * 10) / 10,
    recommended_action: recommendedAction,
    recommended_details: details,
    adjustments,
  };
}

/**
 * Reservation coverage ratio: what fraction of actual covers do reservations
 * typically represent? Nightlife venues often have 30-50% walk-ins.
 * This conservative default assumes rezs are ~60% of total covers.
 */
function rezCoverageRatio(rezSummary: ReservationSummary): number {
  // If there are very few reservations, they're likely a smaller percentage of total
  if (rezSummary.reservationCount <= 3) return 0.3;
  if (rezSummary.reservationCount <= 10) return 0.5;
  return 0.6;
}

function buildCallOffReason(
  forecastChangePct: number | null,
  rezVsForecastPct: number,
  rezCovers: number,
  forecastCovers: number
): string {
  const parts: string[] = [];
  if (forecastChangePct !== null && forecastChangePct <= -10) {
    parts.push(`Forecast dropped ${Math.round(Math.abs(forecastChangePct))}%`);
  }
  if (rezVsForecastPct < 60) {
    parts.push(`Reservations at ${Math.round(rezVsForecastPct)}% of forecast (${rezCovers} rez covers vs ${forecastCovers} forecast)`);
  }
  if (parts.length === 0) {
    parts.push(`Scheduled staff exceeds projected demand (${forecastCovers} forecast covers)`);
  }
  return parts.join('. ') + '.';
}

// ══════════════════════════════════════════════════════════════════════════
// TEST EXPORTS
// ══════════════════════════════════════════════════════════════════════════

export const __test__ = {
  parseTimeToMinutes,
  normalizeMinutes,
  getExpectedCoversAtTime,
  getCutCandidates,
  getOtRiskEmployees,
  rezCoverageRatio,
};
