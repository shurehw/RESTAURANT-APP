/**
 * Inventory Weight Calculation Utilities
 * Bluetooth scale liquor counting math
 */

/**
 * Calculate spirit density in g/ml based on ABV
 * Linear interpolation between water (1.000) and ethanol (0.789)
 */
export function densityGPerMl(abvPercent: number): number {
  return Number((((100 - abvPercent) / 100) * 1.0 + (abvPercent / 100) * 0.789).toFixed(3));
}

/**
 * Compute empty bottle weight from full sealed bottle
 */
export function computeEmptyFromFull(
  fullG: number,
  sizeMl: number,
  abvPercent: number
): number {
  return fullG - sizeMl * densityGPerMl(abvPercent);
}

/**
 * Compute fill ratio and remaining ml from scale weight
 */
export function computeCountFromWeight(
  weightG: number,
  emptyG: number,
  fullG: number | null,
  sizeMl: number,
  abvPercent: number = 40
): {
  fillRatio: number;
  remainingMl: number;
  method: 'empty_full' | 'empty_only' | 'seed_only';
} {
  let fillRatio: number;
  let method: 'empty_full' | 'empty_only' | 'seed_only' = 'empty_only';

  if (fullG && fullG > emptyG) {
    // Best case: we have both empty and full weights
    fillRatio = (weightG - emptyG) / (fullG - emptyG);
    method = 'empty_full';
  } else {
    // Fallback: estimate full weight using ABV density
    const density = densityGPerMl(abvPercent);
    const estFullG = emptyG + sizeMl * density;
    fillRatio = (weightG - emptyG) / (estFullG - emptyG);
    method = 'empty_only';
  }

  // Clamp to valid range [0, 1]
  const clamped = Math.max(0, Math.min(1, fillRatio));
  const remainingMl = clamped * sizeMl;

  return {
    fillRatio: Number(clamped.toFixed(4)),
    remainingMl: Number(remainingMl.toFixed(2)),
    method,
  };
}

/**
 * Convert ml to standard bottle units
 */
export function mlToBottles(ml: number, bottleSizeMl: number): number {
  return Number((ml / bottleSizeMl).toFixed(4));
}

/**
 * Format fill ratio as percentage
 */
export function fillRatioToPercent(fillRatio: number): string {
  return `${(fillRatio * 100).toFixed(1)}%`;
}

/**
 * Validate weight reading
 */
export function validateWeightReading(
  weightG: number,
  emptyG: number,
  fullG: number | null
): { valid: boolean; error?: string } {
  if (weightG < 0) {
    return { valid: false, error: 'Weight cannot be negative' };
  }

  if (weightG < emptyG * 0.95) {
    return { valid: false, error: 'Weight is below empty bottle weight' };
  }

  if (fullG && weightG > fullG * 1.05) {
    return { valid: false, error: 'Weight exceeds full bottle weight' };
  }

  return { valid: true };
}
