/**
 * Service Quality Calculator
 * Calculates service quality scores based on staffing ratios and standards
 */

export interface ServiceQualityStandards {
  max_tables_per_server: number;
  max_covers_per_server: number;
  min_busser_to_server_ratio: number;
  min_runner_to_server_ratio: number;
  min_sommelier_covers_threshold?: number;
  quality_priority_weight: number;
  min_service_quality_score: number;
}

export interface StaffingCounts {
  servers: number;
  bussers: number;
  runners: number;
  sommeliers?: number;
  total_covers: number;
  total_hours?: number;
}

export interface EmployeePerformance {
  employee_id: string;
  performance_rating: number; // 1-5 scale
  covers_per_hour_avg?: number;
}

export interface ServiceQualityScore {
  overall_score: number; // 0.0 to 1.0
  components: {
    server_coverage: number; // 0-1
    support_ratio: number; // 0-1
    experience: number; // 0-1
    efficiency: number; // 0-1
  };
  violations: QualityViolation[];
  meets_minimum: boolean;
}

export interface QualityViolation {
  constraint: string;
  severity: 'warning' | 'critical';
  description: string;
  impact: string;
  current_value?: number;
  required_value?: number;
}

/**
 * Calculate comprehensive service quality score
 */
export function calculateServiceQualityScore(
  staffing: StaffingCounts,
  standards: ServiceQualityStandards,
  employeePerformance?: EmployeePerformance[]
): ServiceQualityScore {
  const components = {
    server_coverage: 0,
    support_ratio: 0,
    experience: 0,
    efficiency: 0
  };

  const violations: QualityViolation[] = [];

  // Component 1: Server Coverage Score (40% weight)
  // Lower covers per server = higher quality
  if (staffing.servers > 0 && staffing.total_covers > 0) {
    const covers_per_server = staffing.total_covers / staffing.servers;

    // Score: 1.0 when at or below max, decreases linearly above max
    components.server_coverage = Math.min(
      1.0,
      standards.max_covers_per_server / covers_per_server
    );

    // Check for violation
    if (covers_per_server > standards.max_covers_per_server) {
      violations.push({
        constraint: 'max_covers_per_server',
        severity: covers_per_server > standards.max_covers_per_server * 1.2 ? 'critical' : 'warning',
        description: `${covers_per_server.toFixed(1)} covers per server exceeds maximum ${standards.max_covers_per_server}`,
        impact: 'Servers may be overloaded, risking service quality degradation',
        current_value: covers_per_server,
        required_value: standards.max_covers_per_server
      });
    }
  } else {
    // No servers or no covers
    components.server_coverage = staffing.servers > 0 ? 1.0 : 0;
  }

  // Component 2: Support Staff Ratio Score (30% weight)
  // Combination of busser and runner ratios
  if (staffing.servers > 0) {
    const busser_ratio = staffing.bussers / staffing.servers;
    const runner_ratio = staffing.runners / staffing.servers;

    // Busser ratio score (50% of support score)
    const busser_score = Math.min(
      1.0,
      busser_ratio / standards.min_busser_to_server_ratio
    );

    // Runner ratio score (50% of support score)
    const runner_score = Math.min(
      1.0,
      runner_ratio / standards.min_runner_to_server_ratio
    );

    components.support_ratio = (busser_score + runner_score) / 2;

    // Check for violations
    if (busser_ratio < standards.min_busser_to_server_ratio) {
      violations.push({
        constraint: 'min_busser_ratio',
        severity: busser_ratio < standards.min_busser_to_server_ratio * 0.7 ? 'critical' : 'warning',
        description: `Busser ratio ${busser_ratio.toFixed(2)} below minimum ${standards.min_busser_to_server_ratio.toFixed(2)}`,
        impact: 'Tables may not be cleared quickly enough, impacting table turns and guest experience',
        current_value: busser_ratio,
        required_value: standards.min_busser_to_server_ratio
      });
    }

    if (runner_ratio < standards.min_runner_to_server_ratio) {
      violations.push({
        constraint: 'min_runner_ratio',
        severity: 'warning',
        description: `Food runner ratio ${runner_ratio.toFixed(2)} below minimum ${standards.min_runner_to_server_ratio.toFixed(2)}`,
        impact: 'Food may not reach tables at optimal temperature, servers may be pulled from service to run food',
        current_value: runner_ratio,
        required_value: standards.min_runner_to_server_ratio
      });
    }

    // Sommelier check
    if (standards.min_sommelier_covers_threshold &&
        staffing.total_covers >= standards.min_sommelier_covers_threshold &&
        (staffing.sommeliers || 0) === 0) {
      violations.push({
        constraint: 'min_sommelier_threshold',
        severity: 'warning',
        description: `${staffing.total_covers} covers exceeds sommelier threshold (${standards.min_sommelier_covers_threshold}) but no sommelier scheduled`,
        impact: 'Missing opportunity for wine pairings and upsells in fine dining service',
        current_value: 0,
        required_value: 1
      });
    }
  } else {
    // No servers
    components.support_ratio = 0;
  }

  // Component 3: Experience Score (20% weight)
  // Based on employee performance ratings
  if (employeePerformance && employeePerformance.length > 0) {
    const avg_rating = employeePerformance.reduce((sum, emp) => sum + emp.performance_rating, 0) / employeePerformance.length;
    components.experience = avg_rating / 5.0; // Normalize to 0-1 (ratings are 1-5)
  } else {
    // Default to moderate experience
    components.experience = 0.7;
  }

  // Component 4: Efficiency Score (10% weight)
  // Based on labor hours vs covers (SPLH - Sales Per Labor Hour proxy)
  if (staffing.total_hours && staffing.total_hours > 0 && staffing.total_covers > 0) {
    const covers_per_hour = staffing.total_covers / staffing.total_hours;

    // Target: ~10 covers per hour for fine dining
    // Score: 1.0 at target, decreases on either side
    const target_cph = 10.0;
    const efficiency_ratio = covers_per_hour / target_cph;

    // Optimal range: 0.8 to 1.2 of target
    if (efficiency_ratio >= 0.8 && efficiency_ratio <= 1.2) {
      components.efficiency = 1.0;
    } else if (efficiency_ratio < 0.8) {
      // Overstaffed
      components.efficiency = Math.max(0.5, efficiency_ratio / 0.8);
    } else {
      // Understaffed
      components.efficiency = Math.max(0.5, 1.2 / efficiency_ratio);
    }
  } else {
    components.efficiency = 0.85; // Default moderate efficiency
  }

  // Calculate overall score (weighted average)
  const overall_score = (
    components.server_coverage * 0.4 +
    components.support_ratio * 0.3 +
    components.experience * 0.2 +
    components.efficiency * 0.1
  );

  // Check if meets minimum threshold
  const meets_minimum = overall_score >= standards.min_service_quality_score;

  if (!meets_minimum) {
    violations.push({
      constraint: 'min_service_quality_score',
      severity: 'critical',
      description: `Overall quality score ${(overall_score * 100).toFixed(1)}% below minimum ${(standards.min_service_quality_score * 100).toFixed(1)}%`,
      impact: 'Service quality standards not met - risk of poor guest experience',
      current_value: overall_score,
      required_value: standards.min_service_quality_score
    });
  }

  return {
    overall_score: Math.round(overall_score * 1000) / 1000,
    components: {
      server_coverage: Math.round(components.server_coverage * 1000) / 1000,
      support_ratio: Math.round(components.support_ratio * 1000) / 1000,
      experience: Math.round(components.experience * 1000) / 1000,
      efficiency: Math.round(components.efficiency * 1000) / 1000
    },
    violations,
    meets_minimum
  };
}

/**
 * Generate recommendations based on quality score
 */
export function generateQualityRecommendations(
  score: ServiceQualityScore,
  staffing: StaffingCounts,
  standards: ServiceQualityStandards
): string[] {
  const recommendations: string[] = [];

  // Server coverage recommendations
  if (score.components.server_coverage < 0.9 && staffing.servers > 0) {
    const covers_per_server = staffing.total_covers / staffing.servers;
    const servers_needed = Math.ceil(staffing.total_covers / standards.max_covers_per_server);
    const additional_servers = servers_needed - staffing.servers;

    if (additional_servers > 0) {
      recommendations.push(`Add ${additional_servers} server(s) to maintain quality standards`);
    }
  }

  // Support ratio recommendations
  if (score.components.support_ratio < 0.9) {
    if (staffing.servers > 0) {
      const required_bussers = Math.ceil(staffing.servers * standards.min_busser_to_server_ratio);
      const busser_gap = required_bussers - staffing.bussers;

      if (busser_gap > 0) {
        recommendations.push(`Add ${busser_gap} busser(s) to improve table service`);
      }

      const required_runners = Math.ceil(staffing.servers * standards.min_runner_to_server_ratio);
      const runner_gap = required_runners - staffing.runners;

      if (runner_gap > 0) {
        recommendations.push(`Add ${runner_gap} food runner(s) to ensure timely food delivery`);
      }
    }
  }

  // Experience recommendations
  if (score.components.experience < 0.7) {
    recommendations.push('Schedule more experienced staff during peak periods');
    recommendations.push('Consider additional training for front-of-house team');
  }

  // Efficiency recommendations
  if (score.components.efficiency < 0.8) {
    recommendations.push('Review labor hours - may be overstaffed for current covers');
  } else if (score.components.efficiency < 0.6) {
    recommendations.push('Significant overstaffing detected - optimize schedule to improve margins');
  }

  // Critical violations
  const critical_violations = score.violations.filter(v => v.severity === 'critical');
  if (critical_violations.length > 0) {
    recommendations.unshift('CRITICAL: Service quality below acceptable minimum - immediate action required');
  }

  return recommendations;
}

/**
 * Check if staffing meets quality standards (boolean check)
 */
export function meetsQualityStandards(
  staffing: StaffingCounts,
  standards: ServiceQualityStandards
): boolean {
  // Must have servers
  if (staffing.servers === 0 && staffing.total_covers > 0) {
    return false;
  }

  // Covers per server check
  if (staffing.servers > 0) {
    const covers_per_server = staffing.total_covers / staffing.servers;
    if (covers_per_server > standards.max_covers_per_server) {
      return false;
    }
  }

  // Busser ratio check
  if (staffing.servers > 0) {
    const busser_ratio = staffing.bussers / staffing.servers;
    if (busser_ratio < standards.min_busser_to_server_ratio * 0.8) { // Allow 20% tolerance
      return false;
    }
  }

  return true;
}

/**
 * Calculate minimum staff needed to meet quality standards
 */
export function calculateMinimumStaffing(
  projected_covers: number,
  standards: ServiceQualityStandards
): {
  servers: number;
  bussers: number;
  runners: number;
  sommeliers: number;
} {
  // Servers: based on max covers per server
  const servers = Math.ceil(projected_covers / standards.max_covers_per_server);

  // Bussers: based on min ratio
  const bussers = Math.ceil(servers * standards.min_busser_to_server_ratio);

  // Runners: based on min ratio
  const runners = Math.ceil(servers * standards.min_runner_to_server_ratio);

  // Sommeliers: based on threshold
  const sommeliers = (standards.min_sommelier_covers_threshold && projected_covers >= standards.min_sommelier_covers_threshold) ? 1 : 0;

  return {
    servers,
    bussers,
    runners,
    sommeliers
  };
}
