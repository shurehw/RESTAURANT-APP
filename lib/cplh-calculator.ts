/**
 * CPLH (Covers Per Labor Hour) Calculator
 * Calculates and analyzes covers per labor hour metrics for labor efficiency
 */

export interface CPLHTarget {
  position_id: string;
  position_name?: string;
  shift_type: string;
  day_of_week?: number;
  target_cplh: number;
  min_cplh: number;
  optimal_cplh: number;
  max_cplh: number;
  covers_range_min?: number;
  covers_range_max?: number;
}

export interface CPLHCalculation {
  covers: number;
  labor_hours: number;
  cplh: number;
  target_cplh: number;
  variance_pct: number;
  variance_absolute: number;
  status: 'excellent' | 'on_target' | 'below_target' | 'poor';
  message: string;
}

export interface CPLHByPosition {
  position_id: string;
  position_name: string;
  covers: number;
  labor_hours: number;
  cplh: number;
  target_cplh: number;
  variance_pct: number;
  status: 'excellent' | 'on_target' | 'below_target' | 'poor';
  recommendation?: string;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  position_id: string;
  position_name?: string;
  scheduled_hours: number;
  shift_cost?: number;
  business_date: string;
  shift_type: string;
}

/**
 * Calculate CPLH (Covers Per Labor Hour) for a given set of covers and hours
 */
export function calculateCPLH(
  covers: number,
  labor_hours: number,
  target_cplh: number
): CPLHCalculation {
  if (labor_hours <= 0) {
    return {
      covers,
      labor_hours,
      cplh: 0,
      target_cplh,
      variance_pct: -100,
      variance_absolute: -target_cplh,
      status: 'poor',
      message: 'No labor hours scheduled'
    };
  }

  const cplh = covers / labor_hours;
  const variance_absolute = cplh - target_cplh;
  const variance_pct = target_cplh > 0 ? (variance_absolute / target_cplh) * 100 : 0;

  // Determine status based on variance from target
  let status: CPLHCalculation['status'];
  let message: string;

  if (variance_pct >= 10) {
    status = 'excellent';
    message = `Exceeds target by ${variance_pct.toFixed(1)}% - high efficiency`;
  } else if (variance_pct >= -5) {
    status = 'on_target';
    message = `Within target range (${variance_pct >= 0 ? '+' : ''}${variance_pct.toFixed(1)}%)`;
  } else if (variance_pct >= -15) {
    status = 'below_target';
    message = `Below target by ${Math.abs(variance_pct).toFixed(1)}% - slightly overstaffed`;
  } else {
    status = 'poor';
    message = `Significantly below target (${variance_pct.toFixed(1)}%) - overstaffed`;
  }

  return {
    covers,
    labor_hours,
    cplh: Math.round(cplh * 100) / 100,
    target_cplh,
    variance_pct: Math.round(variance_pct * 10) / 10,
    variance_absolute: Math.round(variance_absolute * 100) / 100,
    status,
    message
  };
}

/**
 * Calculate CPLH breakdown by position
 */
export function calculateCPLHByPosition(
  shifts: ShiftAssignment[],
  actual_covers: number,
  targets: CPLHTarget[]
): CPLHByPosition[] {
  // Group shifts by position
  const byPosition = shifts.reduce((acc, shift) => {
    const key = shift.position_id;
    if (!acc[key]) {
      acc[key] = {
        position_id: shift.position_id,
        position_name: shift.position_name || shift.position_id,
        hours: 0,
        target: 0
      };
    }
    acc[key].hours += shift.scheduled_hours;
    return acc;
  }, {} as Record<string, { position_id: string; position_name: string; hours: number; target: number }>);

  // Match targets to positions
  const results: CPLHByPosition[] = [];

  for (const [position_id, data] of Object.entries(byPosition)) {
    // Find matching target
    const target = targets.find(t =>
      t.position_id === position_id &&
      (actual_covers === 0 ||
        !t.covers_range_min ||
        !t.covers_range_max ||
        (actual_covers >= t.covers_range_min && actual_covers <= t.covers_range_max))
    );

    const target_cplh = target?.target_cplh || 10.0; // Default fallback

    const cplh_calc = calculateCPLH(actual_covers, data.hours, target_cplh);

    // Generate recommendation
    let recommendation: string | undefined;
    if (cplh_calc.status === 'poor') {
      const hours_to_cut = Math.ceil(actual_covers / target_cplh - data.hours);
      recommendation = `Consider reducing ${Math.abs(hours_to_cut)} hours to reach target CPLH`;
    } else if (cplh_calc.status === 'excellent' && cplh_calc.variance_pct > 20) {
      recommendation = `Efficiency is high - monitor service quality to ensure standards are maintained`;
    }

    results.push({
      position_id: data.position_id,
      position_name: data.position_name,
      covers: actual_covers,
      labor_hours: data.hours,
      cplh: cplh_calc.cplh,
      target_cplh,
      variance_pct: cplh_calc.variance_pct,
      status: cplh_calc.status,
      recommendation
    });
  }

  return results;
}

/**
 * Calculate CPLH for multiple shifts grouped by day/shift_type
 */
export function calculateCPLHByShift(
  shifts: ShiftAssignment[],
  covers_by_shift: Record<string, number>, // key: "YYYY-MM-DD:shift_type"
  targets: CPLHTarget[]
): Record<string, CPLHCalculation> {
  // Group shifts by date + shift_type
  const grouped = shifts.reduce((acc, shift) => {
    const key = `${shift.business_date}:${shift.shift_type}`;
    if (!acc[key]) {
      acc[key] = {
        date: shift.business_date,
        shift_type: shift.shift_type,
        hours: 0
      };
    }
    acc[key].hours += shift.scheduled_hours;
    return acc;
  }, {} as Record<string, { date: string; shift_type: string; hours: number }>);

  const results: Record<string, CPLHCalculation> = {};

  for (const [key, data] of Object.entries(grouped)) {
    const covers = covers_by_shift[key] || 0;

    // Find matching target (use most specific match)
    const day_of_week = new Date(data.date).getDay();
    const target = targets.find(t =>
      t.shift_type === data.shift_type &&
      (t.day_of_week === undefined || t.day_of_week === day_of_week)
    );

    const target_cplh = target?.target_cplh || 10.0;

    results[key] = calculateCPLH(covers, data.hours, target_cplh);
  }

  return results;
}

/**
 * Calculate recommended labor hours based on predicted covers and target CPLH
 */
export function calculateRecommendedLaborHours(
  predicted_covers: number,
  target_cplh: number,
  min_hours?: number,
  max_hours?: number
): number {
  if (predicted_covers <= 0 || target_cplh <= 0) {
    return min_hours || 0;
  }

  let recommended = predicted_covers / target_cplh;

  // Apply constraints
  if (min_hours !== undefined && recommended < min_hours) {
    recommended = min_hours;
  }

  if (max_hours !== undefined && recommended > max_hours) {
    recommended = max_hours;
  }

  return Math.round(recommended * 10) / 10; // Round to 1 decimal
}

/**
 * Determine if CPLH is within acceptable range
 */
export function isCPLHWithinRange(
  actual_cplh: number,
  target: CPLHTarget
): { within_range: boolean; issue?: string } {
  if (actual_cplh < target.min_cplh) {
    return {
      within_range: false,
      issue: `Below minimum (${target.min_cplh}) - overstaffed`
    };
  }

  if (actual_cplh > target.max_cplh) {
    return {
      within_range: false,
      issue: `Above maximum (${target.max_cplh}) - service quality risk`
    };
  }

  return { within_range: true };
}

/**
 * Calculate CPLH trend (improving, stable, declining)
 */
export function calculateCPLHTrend(
  historical_cplh: Array<{ date: string; cplh: number }>
): {
  trend: 'improving' | 'stable' | 'declining';
  change_pct: number;
  avg_cplh: number;
} {
  if (historical_cplh.length < 2) {
    return { trend: 'stable', change_pct: 0, avg_cplh: historical_cplh[0]?.cplh || 0 };
  }

  // Sort by date
  const sorted = [...historical_cplh].sort((a, b) => a.date.localeCompare(b.date));

  // Calculate average
  const avg_cplh = sorted.reduce((sum, item) => sum + item.cplh, 0) / sorted.length;

  // Compare first half to second half
  const midpoint = Math.floor(sorted.length / 2);
  const first_half_avg = sorted.slice(0, midpoint).reduce((sum, item) => sum + item.cplh, 0) / midpoint;
  const second_half_avg = sorted.slice(midpoint).reduce((sum, item) => sum + item.cplh, 0) / (sorted.length - midpoint);

  const change_pct = first_half_avg > 0 ? ((second_half_avg - first_half_avg) / first_half_avg) * 100 : 0;

  let trend: 'improving' | 'stable' | 'declining';
  if (change_pct > 5) {
    trend = 'improving';
  } else if (change_pct < -5) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }

  return {
    trend,
    change_pct: Math.round(change_pct * 10) / 10,
    avg_cplh: Math.round(avg_cplh * 100) / 100
  };
}
