/**
 * Margin Improvement Calculator
 * Analyzes labor cost savings and margin improvements from optimization
 */

export interface MarginBaseline {
  labor_cost: number;
  revenue: number;
  labor_percentage: number;
  cplh: number;
  total_hours: number;
  service_quality_score?: number;
}

export interface MarginCurrent {
  labor_cost: number;
  revenue: number;
  labor_percentage: number;
  cplh: number;
  total_hours: number;
  service_quality_score?: number;
}

export interface MarginRecommendation {
  action: string;
  expected_impact: number; // Labor % points or dollar savings
  effort: 'low' | 'medium' | 'high';
  priority: number; // 1 = highest
  details: string;
}

export interface MarginImprovementAnalysis {
  baseline_labor_pct: number;
  current_labor_pct: number;
  improvement_pct: number; // Percentage points improvement
  cost_savings: number; // Dollar savings
  revenue_impact: number; // Estimated revenue change from quality changes
  net_margin_improvement: number; // Net dollar improvement
  quality_impact: number; // Change in quality score
  recommendations: MarginRecommendation[];
  roi_summary: string;
}

/**
 * Calculate margin improvement from baseline to current state
 */
export function calculateMarginImprovement(
  baseline: MarginBaseline,
  current: MarginCurrent
): MarginImprovementAnalysis {
  // Labor percentage calculations
  const baseline_labor_pct = (baseline.labor_cost / baseline.revenue) * 100;
  const current_labor_pct = (current.labor_cost / current.revenue) * 100;
  const improvement_pct = baseline_labor_pct - current_labor_pct;

  // Cost savings
  const cost_savings = baseline.labor_cost - current.labor_cost;

  // Estimate revenue impact from service quality changes
  // Assumption: Each 0.1 quality score change = ~2% revenue impact
  let revenue_impact = 0;
  let quality_impact = 0;

  if (baseline.service_quality_score !== undefined && current.service_quality_score !== undefined) {
    quality_impact = current.service_quality_score - baseline.service_quality_score;
    revenue_impact = baseline.revenue * quality_impact * 0.2; // 20% coefficient (0.1 quality = 2% revenue)
  }

  // Net margin improvement
  const net_margin_improvement = cost_savings + revenue_impact;

  // Generate recommendations
  const recommendations = generateMarginRecommendations(baseline, current, improvement_pct, quality_impact);

  // ROI summary
  const roi_summary = generateROISummary(
    cost_savings,
    revenue_impact,
    improvement_pct,
    quality_impact
  );

  return {
    baseline_labor_pct: Math.round(baseline_labor_pct * 10) / 10,
    current_labor_pct: Math.round(current_labor_pct * 10) / 10,
    improvement_pct: Math.round(improvement_pct * 10) / 10,
    cost_savings: Math.round(cost_savings * 100) / 100,
    revenue_impact: Math.round(revenue_impact * 100) / 100,
    net_margin_improvement: Math.round(net_margin_improvement * 100) / 100,
    quality_impact: Math.round(quality_impact * 1000) / 1000,
    recommendations,
    roi_summary
  };
}

/**
 * Generate margin improvement recommendations
 */
function generateMarginRecommendations(
  baseline: MarginBaseline,
  current: MarginCurrent,
  improvement_pct: number,
  quality_impact: number
): MarginRecommendation[] {
  const recommendations: MarginRecommendation[] = [];

  // Recommendation 1: If improvement is positive and quality is maintained
  if (improvement_pct > 0 && quality_impact >= -0.05) {
    recommendations.push({
      action: 'Maintain current optimization strategy',
      expected_impact: improvement_pct,
      effort: 'low',
      priority: 1,
      details: `Current optimization is delivering ${improvement_pct.toFixed(1)} point labor % improvement while maintaining quality`
    });
  }

  // Recommendation 2: If CPLH has room for improvement
  const cplh_improvement_opportunity = current.cplh < baseline.cplh * 1.1;
  if (cplh_improvement_opportunity && current.cplh > 0) {
    const target_cplh = baseline.cplh * 1.15; // 15% improvement target
    const potential_hours_reduction = (current.revenue / current.labor_cost) * current.total_hours * (1 - current.cplh / target_cplh);
    const potential_savings = (potential_hours_reduction / current.total_hours) * current.labor_cost;

    recommendations.push({
      action: 'Increase covers per labor hour efficiency',
      expected_impact: potential_savings,
      effort: 'medium',
      priority: 2,
      details: `Target CPLH increase from ${current.cplh.toFixed(1)} to ${target_cplh.toFixed(1)} could save $${potential_savings.toFixed(0)}`
    });
  }

  // Recommendation 3: If quality has degraded
  if (quality_impact < -0.1) {
    recommendations.push({
      action: 'Restore service quality before further optimization',
      expected_impact: -quality_impact * 0.2 * 100, // Estimated revenue recovery %
      effort: 'high',
      priority: 1,
      details: `Quality score decreased by ${(quality_impact * 100).toFixed(1)}% - prioritize quality recovery to protect revenue`
    });
  }

  // Recommendation 4: If overstaffed (negative improvement)
  if (improvement_pct < -2) {
    const target_labor_cost = baseline.revenue * (baseline.labor_percentage / 100);
    const potential_savings = current.labor_cost - target_labor_cost;

    recommendations.push({
      action: 'Reduce labor hours to baseline levels',
      expected_impact: potential_savings,
      effort: 'low',
      priority: 1,
      details: `Currently ${Math.abs(improvement_pct).toFixed(1)} points above baseline - reduce hours to save $${potential_savings.toFixed(0)}`
    });
  }

  // Recommendation 5: Optimize non-peak periods
  if (improvement_pct < 1.5 && improvement_pct >= 0) {
    recommendations.push({
      action: 'Focus optimization on non-peak periods',
      expected_impact: 0.5,
      effort: 'medium',
      priority: 3,
      details: 'Analyze breakfast and lunch shifts for additional efficiency gains while protecting dinner service'
    });
  }

  // Recommendation 6: Cross-training opportunities
  if (current.total_hours > baseline.total_hours * 0.95) {
    recommendations.push({
      action: 'Implement cross-training program',
      expected_impact: 0.3,
      effort: 'high',
      priority: 4,
      details: 'Train staff in multiple positions to reduce total headcount needed per shift'
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  return recommendations;
}

/**
 * Generate ROI summary text
 */
function generateROISummary(
  cost_savings: number,
  revenue_impact: number,
  improvement_pct: number,
  quality_impact: number
): string {
  const parts: string[] = [];

  if (cost_savings > 0) {
    parts.push(`$${cost_savings.toFixed(0)} labor cost savings (${improvement_pct.toFixed(1)} point improvement)`);
  } else if (cost_savings < 0) {
    parts.push(`$${Math.abs(cost_savings).toFixed(0)} increased labor cost (${Math.abs(improvement_pct).toFixed(1)} point increase)`);
  }

  if (revenue_impact !== 0) {
    if (revenue_impact > 0) {
      parts.push(`$${revenue_impact.toFixed(0)} estimated revenue gain from quality improvement`);
    } else {
      parts.push(`$${Math.abs(revenue_impact).toFixed(0)} estimated revenue risk from quality decline`);
    }
  }

  if (quality_impact !== 0) {
    const quality_pct = quality_impact * 100;
    if (quality_pct > 0) {
      parts.push(`service quality improved by ${quality_pct.toFixed(1)}%`);
    } else {
      parts.push(`service quality declined by ${Math.abs(quality_pct).toFixed(1)}%`);
    }
  }

  if (parts.length === 0) {
    return 'No significant change from baseline';
  }

  return parts.join('; ');
}

/**
 * Calculate projected annual impact
 */
export function calculateAnnualImpact(
  weekly_savings: number,
  weeks_per_year: number = 52
): {
  annual_savings: number;
  quarterly_savings: number;
  monthly_savings: number;
} {
  const annual_savings = weekly_savings * weeks_per_year;
  const quarterly_savings = annual_savings / 4;
  const monthly_savings = annual_savings / 12;

  return {
    annual_savings: Math.round(annual_savings),
    quarterly_savings: Math.round(quarterly_savings),
    monthly_savings: Math.round(monthly_savings)
  };
}

/**
 * Calculate break-even analysis for optimization investment
 */
export function calculateBreakeven(
  implementation_cost: number,
  weekly_savings: number
): {
  weeks_to_breakeven: number;
  months_to_breakeven: number;
  roi_1year_pct: number;
} {
  const weeks_to_breakeven = implementation_cost / weekly_savings;
  const months_to_breakeven = weeks_to_breakeven / 4.33; // Average weeks per month

  const annual_savings = weekly_savings * 52;
  const roi_1year_pct = ((annual_savings - implementation_cost) / implementation_cost) * 100;

  return {
    weeks_to_breakeven: Math.round(weeks_to_breakeven * 10) / 10,
    months_to_breakeven: Math.round(months_to_breakeven * 10) / 10,
    roi_1year_pct: Math.round(roi_1year_pct)
  };
}

/**
 * Compare multiple time periods for trend analysis
 */
export function compareMultiplePeriods(
  periods: Array<{ period_name: string; labor_cost: number; revenue: number; cplh: number }>
): {
  trend: 'improving' | 'stable' | 'declining';
  avg_labor_pct: number;
  best_period: string;
  worst_period: string;
  variance_pct: number;
} {
  if (periods.length === 0) {
    throw new Error('No periods provided');
  }

  // Calculate labor % for each period
  const with_labor_pct = periods.map(p => ({
    ...p,
    labor_pct: (p.labor_cost / p.revenue) * 100
  }));

  // Find best and worst
  const sorted = [...with_labor_pct].sort((a, b) => a.labor_pct - b.labor_pct);
  const best_period = sorted[0].period_name;
  const worst_period = sorted[sorted.length - 1].period_name;

  // Calculate average
  const avg_labor_pct = with_labor_pct.reduce((sum, p) => sum + p.labor_pct, 0) / with_labor_pct.length;

  // Calculate variance
  const variance = with_labor_pct.reduce((sum, p) => sum + Math.pow(p.labor_pct - avg_labor_pct, 2), 0) / with_labor_pct.length;
  const variance_pct = Math.sqrt(variance);

  // Determine trend
  const first_half = with_labor_pct.slice(0, Math.floor(with_labor_pct.length / 2));
  const second_half = with_labor_pct.slice(Math.floor(with_labor_pct.length / 2));

  const first_avg = first_half.reduce((sum, p) => sum + p.labor_pct, 0) / first_half.length;
  const second_avg = second_half.reduce((sum, p) => sum + p.labor_pct, 0) / second_half.length;

  let trend: 'improving' | 'stable' | 'declining';
  if (second_avg < first_avg - 0.5) {
    trend = 'improving'; // Labor % decreasing = improving margins
  } else if (second_avg > first_avg + 0.5) {
    trend = 'declining'; // Labor % increasing = declining margins
  } else {
    trend = 'stable';
  }

  return {
    trend,
    avg_labor_pct: Math.round(avg_labor_pct * 10) / 10,
    best_period,
    worst_period,
    variance_pct: Math.round(variance_pct * 10) / 10
  };
}
