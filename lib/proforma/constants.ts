// Seating Density Benchmarks by Concept Type

export interface ConceptBenchmarks {
  sfPerSeat: [number, number];
  seatsPerThousandSF: [number, number];
  diningAreaPct: [number, number];
}

export const SEATING_BENCHMARKS: Record<string, ConceptBenchmarks> = {
  "fast-casual": {
    sfPerSeat: [12, 18],
    seatsPerThousandSF: [55, 85],
    diningAreaPct: [55, 65],
  },
  "casual-dining": {
    sfPerSeat: [18, 22],
    seatsPerThousandSF: [45, 55],
    diningAreaPct: [60, 70],
  },
  "premium-casual": {
    sfPerSeat: [22, 26],
    seatsPerThousandSF: [38, 45],
    diningAreaPct: [65, 75],
  },
  "fine-dining": {
    sfPerSeat: [28, 40],
    seatsPerThousandSF: [25, 35],
    diningAreaPct: [70, 80],
  },
  "bar-lounge": {
    sfPerSeat: [14, 20],
    seatsPerThousandSF: [50, 70],
    diningAreaPct: [50, 65],
  },
  "nightclub": {
    sfPerSeat: [7, 10],
    seatsPerThousandSF: [100, 140],
    diningAreaPct: [60, 80],
  },
};

// Back-of-House Allocation
export const BOH_ALLOCATION = {
  kitchenBOH: [25, 35],
  storageOffice: [5, 10],
  guestFacing: [60, 70],
};

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

// Hard Constraint Guards
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

export function validateSpaceConstraints(constraints: SpaceConstraints): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Concept-specific SF per seat validation (skip if manual seats are used - sfPerSeat = 0)
  if (constraints.sfPerSeat > 0) {
    switch (constraints.conceptType) {
      case "full-service":
      case "casual-dining":
      case "premium-casual":
        if (constraints.sfPerSeat < 18 || constraints.sfPerSeat > 26) {
          warnings.push(`Full service typically requires 18-26 SF/seat. Current: ${constraints.sfPerSeat}`);
        }
        break;
      case "fine-dining":
        if (constraints.sfPerSeat < 28) {
          errors.push(`Fine dining requires minimum 28 SF/seat. Current: ${constraints.sfPerSeat}`);
        }
        break;
      case "fast-casual":
        if (constraints.sfPerSeat > 18) {
          warnings.push(`Fast casual typically uses ≤18 SF/seat. Current: ${constraints.sfPerSeat}`);
        }
        break;
    }
  }

  // BOH validation (skip if manual splits are used - bohPct = 0)
  if (constraints.bohPct > 0 && constraints.bohPct < 25) {
    errors.push(`BOH allocation below minimum (25%). Current: ${constraints.bohPct}%`);
  }

  // Rent per seat validation
  if (constraints.rentPerSeatPerMonth && constraints.rentPerSeatPerMonth > 250) {
    warnings.push(`HIGH RISK: Rent/seat/month exceeds $250. Current: $${constraints.rentPerSeatPerMonth}`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// Concept type options for dropdowns
export const CONCEPT_TYPES = [
  { value: "fast-casual", label: "Fast Casual / QSR" },
  { value: "casual-dining", label: "Casual Dining" },
  { value: "premium-casual", label: "Premium Casual / Full Service" },
  { value: "fine-dining", label: "Fine Dining" },
  { value: "bar-lounge", label: "Bar / Cocktail Lounge" },
  { value: "nightclub", label: "Nightclub / Standing" },
];
