/**
 * FP&A-Grade Labor Rate Calculator
 *
 * Single-input wage model using city minimum wage as the primary driver.
 * Mirrors the SQL function: calculate_position_hourly_rate()
 */

export type MarketTier = 'LOW' | 'MID' | 'HIGH';

export interface WageParameters {
  minWageCity: number;
  tipCredit?: number;
  marketTier?: MarketTier;
}

export interface PositionTemplate {
  position_name: string;
  wage_multiplier: number;
  is_tipped: boolean;
  category: 'FOH' | 'BOH';
  labor_driver_type: 'VOLUME' | 'PRESENCE' | 'THRESHOLD';
}

export interface LaborSettings {
  market_tier_low_multiplier: number;
  market_tier_mid_multiplier: number;
  market_tier_high_multiplier: number;
  tipped_min_wage_floor_pct: number;
  default_min_wage_city: number;
  default_tip_credit: number;
  default_market_tier: MarketTier;
}

export interface WageCalculationBreakdown {
  is_tipped: boolean;
  min_wage: number;
  tip_credit?: number;
  tipped_floor_pct?: number;
  tipped_cash_wage?: number;
  position_multiplier: number;
  base_rate: number;
  market_tier: MarketTier;
  tier_multiplier: number;
  final_rate: number;
  calculation_steps: Array<{
    step: number;
    description: string;
    formula: string;
    value: number;
  }>;
}

/**
 * P0 FIX: NO DEFAULT FALLBACKS ALLOWED
 * settings parameter is now REQUIRED - caller MUST fetch from API
 * This prevents silent drift when DB settings are missing or API fails
 *
 * Calculate hourly rate for a position using labor settings
 *
 * Formula:
 * - Tipped: max(min_wage - tip_credit, min_wage × floor_pct) × position_multiplier × tier_multiplier
 * - Non-tipped: min_wage × position_multiplier × tier_multiplier
 */
export function calculatePositionRate(
  params: WageParameters,
  position: Pick<PositionTemplate, 'wage_multiplier' | 'is_tipped'>,
  settings: LaborSettings // REQUIRED - no default value
): number {
  const { minWageCity, tipCredit = 0, marketTier = 'MID' } = params;

  // Market tier multiplier from settings
  const tierMultiplier =
    marketTier === 'LOW'
      ? settings.market_tier_low_multiplier
      : marketTier === 'HIGH'
      ? settings.market_tier_high_multiplier
      : settings.market_tier_mid_multiplier;

  let baseRate: number;

  if (position.is_tipped) {
    // Tipped cash wage: never go below floor % of min wage (from settings)
    const tippedCashWage = Math.max(
      minWageCity - tipCredit,
      minWageCity * settings.tipped_min_wage_floor_pct
    );

    // Apply position multiplier (e.g., Bartender 1.10×, Server 1.00×)
    baseRate = tippedCashWage * position.wage_multiplier;
  } else {
    // Non-tipped: simple multiplier formula
    baseRate = minWageCity * position.wage_multiplier;
  }

  // Apply market tier and round to 2 decimals
  return Math.round(baseRate * tierMultiplier * 100) / 100;
}

/**
 * Calculate hourly rate with detailed breakdown for math transparency
 * P0: settings parameter REQUIRED (no fallback)
 */
export function calculatePositionRateWithBreakdown(
  params: WageParameters,
  position: Pick<PositionTemplate, 'wage_multiplier' | 'is_tipped'>,
  settings: LaborSettings // REQUIRED - no default value
): WageCalculationBreakdown {
  const { minWageCity, tipCredit = 0, marketTier = 'MID' } = params;

  // Market tier multiplier from settings
  const tierMultiplier =
    marketTier === 'LOW'
      ? settings.market_tier_low_multiplier
      : marketTier === 'HIGH'
      ? settings.market_tier_high_multiplier
      : settings.market_tier_mid_multiplier;

  let baseRate: number;
  let tippedCashWage: number | undefined;
  const calculation_steps: WageCalculationBreakdown['calculation_steps'] = [];

  if (position.is_tipped) {
    // Tipped cash wage calculation
    tippedCashWage = Math.max(
      minWageCity - tipCredit,
      minWageCity * settings.tipped_min_wage_floor_pct
    );

    calculation_steps.push({
      step: 1,
      description: 'Calculate tipped cash wage',
      formula: `max(${minWageCity} - ${tipCredit}, ${minWageCity} × ${settings.tipped_min_wage_floor_pct})`,
      value: Math.round(tippedCashWage * 100) / 100,
    });

    baseRate = tippedCashWage * position.wage_multiplier;

    calculation_steps.push({
      step: 2,
      description: 'Apply position skill multiplier',
      formula: `${Math.round(tippedCashWage * 100) / 100} × ${position.wage_multiplier}`,
      value: Math.round(baseRate * 100) / 100,
    });
  } else {
    baseRate = minWageCity * position.wage_multiplier;

    calculation_steps.push({
      step: 1,
      description: 'Apply position skill multiplier',
      formula: `${minWageCity} × ${position.wage_multiplier}`,
      value: Math.round(baseRate * 100) / 100,
    });
  }

  const finalRate = Math.round(baseRate * tierMultiplier * 100) / 100;

  calculation_steps.push({
    step: position.is_tipped ? 3 : 2,
    description: 'Apply market tier multiplier',
    formula: `${Math.round(baseRate * 100) / 100} × ${tierMultiplier}`,
    value: finalRate,
  });

  return {
    is_tipped: position.is_tipped,
    min_wage: minWageCity,
    tip_credit: position.is_tipped ? tipCredit : undefined,
    tipped_floor_pct: position.is_tipped ? settings.tipped_min_wage_floor_pct : undefined,
    tipped_cash_wage: tippedCashWage,
    position_multiplier: position.wage_multiplier,
    base_rate: Math.round(baseRate * 100) / 100,
    market_tier: marketTier,
    tier_multiplier: tierMultiplier,
    final_rate: finalRate,
    calculation_steps,
  };
}

/**
 * Calculate rates for all positions in a list
 */
export function calculateAllPositionRates(
  params: WageParameters,
  positions: PositionTemplate[],
  settings: LaborSettings
): Array<PositionTemplate & { calculated_rate: number }> {
  return positions.map(pos => ({
    ...pos,
    calculated_rate: calculatePositionRate(params, pos, settings),
  }));
}

/**
 * @deprecated Position wage multipliers now stored in database
 * Fetch from proforma_labor_position_templates table instead
 * These values were migrated to DB in migration 110/111
 *
 * DO NOT USE - kept only to prevent import errors during migration
 * Single source of truth: database
 */
export const DEFAULT_WAGE_MULTIPLIERS_DEPRECATED: Record<string, { multiplier: number; is_tipped: boolean }> = {
  // This constant should NOT be used - all values are in DB
  // See: proforma_labor_position_templates table
};
