// ============================================================================
// SEATING BENCHMARKS - NOW DATABASE-DRIVEN
// Fetch from /api/proforma/concept-benchmarks instead of hardcoded constants
// ============================================================================

export interface ConceptBenchmarks {
  sfPerSeat: [number, number];
  seatsPerThousandSF: [number, number];
  diningAreaPct: [number, number];
  // Optional BOH data
  kitchenBOH?: [number, number];
  storageOffice?: [number, number];
  guestFacing?: [number, number];
}

/**
 * P0 FIX: DEPRECATED CONSTANTS REMOVED
 *
 * SEATING_BENCHMARKS - DELETED
 * BOH_ALLOCATION - DELETED
 *
 * All seating and space benchmarks are now database-driven.
 * Fetch from: /api/proforma/concept-benchmarks
 *
 * If you see import errors, update your code to fetch from the API:
 * const { data: benchmarks } = await fetch('/api/proforma/concept-benchmarks?concept_type=...')
 */

// Capacity Calculation Functions
export function calculateSeats(totalSF: number, diningAreaPct: number, sfPerSeat: number): number {
  return Math.floor((totalSF * (diningAreaPct / 100)) / sfPerSeat);
}

export function calculateAnnualRevenueCeiling(
  seats: number,
  turnsPerDay: number,
  avgCheck: number
): number {
  return seats * turnsPerDay * avgCheck * 360;
}

// ============================================================================
// VALIDATION - NOW DATABASE-DRIVEN
// Fetch from /api/proforma/validation-rules instead of hardcoded logic
// ============================================================================

export interface SpaceConstraints {
  totalSF: number;
  sfPerSeat: number;
  bohPct: number;
  rentPerSeatPerMonth?: number;
  conceptType: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface ValidationRule {
  metric: string;
  concept_type?: string;
  min_value?: number;
  max_value?: number;
  severity: 'info' | 'warning' | 'error';
  message_template: string;
}

/**
 * P0 FIX: DEPRECATED - FUNCTION DELETED
 *
 * validateSpaceConstraints() - REMOVED
 *
 * Use validateWithRules() instead, which fetches validation rules from database.
 * This ensures validation thresholds can be configured per tenant without code changes.
 *
 * Example:
 * const rules = await fetch('/api/proforma/validation-rules?concept_type=...')
 * const result = validateWithRules(constraints, rules)
 */

/**
 * Validate constraints using database-driven rules
 * Replaces hardcoded validateSpaceConstraints()
 */
export function validateWithRules(
  constraints: SpaceConstraints,
  rules: ValidationRule[]
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const infos: string[] = [];

  for (const rule of rules) {
    // Skip if rule doesn't apply to this concept
    if (rule.concept_type && rule.concept_type !== constraints.conceptType) {
      continue;
    }

    let value: number | undefined;
    let violated = false;

    // Get the relevant value based on metric
    switch (rule.metric) {
      case 'sf_per_seat':
        value = constraints.sfPerSeat;
        break;
      case 'boh_pct':
        value = constraints.bohPct;
        break;
      case 'rent_per_seat_month':
        value = constraints.rentPerSeatPerMonth;
        break;
      default:
        continue;
    }

    if (value === undefined) continue;

    // Check if value violates rule
    if (rule.min_value !== null && rule.min_value !== undefined && value < rule.min_value) {
      violated = true;
    }
    if (rule.max_value !== null && rule.max_value !== undefined && value > rule.max_value) {
      violated = true;
    }

    if (violated) {
      // Replace template placeholders
      const message = rule.message_template
        .replace('{value}', value.toString())
        .replace('{min}', rule.min_value?.toString() || '')
        .replace('{max}', rule.max_value?.toString() || '')
        .replace('{concept}', constraints.conceptType);

      switch (rule.severity) {
        case 'error':
          errors.push(message);
          break;
        case 'warning':
          warnings.push(message);
          break;
        case 'info':
          infos.push(message);
          break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// Backwards compatibility: alias for validateWithRules
export const validateSpaceConstraints = validateWithRules;

// Seating density benchmarks
export const SEATING_BENCHMARKS: Record<string, {
  sfPerSeat: [number, number];
  seatsPerThousandSF: [number, number];
  diningAreaPct: [number, number];
}> = {
  'high-density': {
    sfPerSeat: [10, 15],
    seatsPerThousandSF: [65, 100],
    diningAreaPct: [60, 70],
  },
  'medium-density': {
    sfPerSeat: [15, 20],
    seatsPerThousandSF: [50, 65],
    diningAreaPct: [55, 65],
  },
  'low-density': {
    sfPerSeat: [20, 30],
    seatsPerThousandSF: [33, 50],
    diningAreaPct: [50, 60],
  },
};

// Concept type options for dropdowns
export const CONCEPT_TYPES = [
  { value: "fast-casual", label: "Fast Casual / QSR" },
  { value: "casual-dining", label: "Casual Dining" },
  { value: "premium-casual", label: "Premium Casual / Full Service" },
  { value: "fine-dining", label: "Fine Dining" },
  { value: "bar-lounge", label: "Bar / Cocktail Lounge" },
  { value: "nightclub", label: "Nightclub / Standing" },
];
