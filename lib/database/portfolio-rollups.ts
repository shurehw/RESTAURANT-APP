/**
 * Portfolio Rollups Database Layer
 *
 * Pre-computed enforcement scorecard data per org + venue.
 * Feeds the Home page in <2s instead of live TipSee queries.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface PortfolioRollup {
  id: string;
  org_id: string;
  venue_id: string | null;
  rollup_date: string;

  // Attestation compliance
  attestation_expected: number;
  attestation_submitted: number;
  attestation_late: number;
  attestation_missed: number;
  attestation_compliance_pct: number;

  // Open enforcement items
  carry_forward_count: number;
  critical_open_count: number;
  escalated_count: number;

  // Exception counts by domain
  comp_exception_count: number;
  labor_exception_count: number;
  procurement_exception_count: number;
  revenue_variance_count: number;

  // Revenue summary
  total_net_revenue: number;
  total_covers: number;
  avg_check: number;

  // Labor summary
  total_labor_cost: number;
  labor_pct: number;

  // Top risk venues (portfolio row only)
  top_venues_json: TopRiskVenue[] | null;

  // Metadata
  computed_at: string;
  compute_duration_ms: number | null;
}

export interface TopRiskVenue {
  venue_id: string;
  venue_name: string;
  risk_score: number;
  missed_attestation: boolean;
  critical_items: number;
  carry_forward: number;
  labor_exceptions: number;
}

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════════════════════

const rollupCache = new Map<string, { data: PortfolioRollup; ts: number }>();
const venueRollupCache = new Map<string, { data: PortfolioRollup[]; ts: number }>();
const ROLLUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(orgId: string, date: string): string {
  return `${orgId}:${date}`;
}

// ══════════════════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get portfolio-level rollup for an org (venue_id IS NULL).
 * This is the primary data source for the Home page scorecard.
 */
export async function getPortfolioRollup(
  orgId: string,
  date: string
): Promise<PortfolioRollup | null> {
  const key = cacheKey(orgId, date);
  const cached = rollupCache.get(key);
  if (cached && Date.now() - cached.ts < ROLLUP_TTL_MS) {
    return cached.data;
  }

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('enforcement_portfolio_rollups')
    .select('*')
    .eq('org_id', orgId)
    .eq('rollup_date', date)
    .is('venue_id', null)
    .single();

  if (error || !data) {
    return null;
  }

  const rollup = normalizeRollup(data);
  rollupCache.set(key, { data: rollup, ts: Date.now() });
  return rollup;
}

/**
 * Get venue-level rollups for an org on a given date.
 * Used for the venue breakdown table on the Home page.
 */
export async function getVenueRollups(
  orgId: string,
  date: string
): Promise<PortfolioRollup[]> {
  const key = cacheKey(orgId, date);
  const cached = venueRollupCache.get(key);
  if (cached && Date.now() - cached.ts < ROLLUP_TTL_MS) {
    return cached.data;
  }

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('enforcement_portfolio_rollups')
    .select('*')
    .eq('org_id', orgId)
    .eq('rollup_date', date)
    .not('venue_id', 'is', null)
    .order('total_net_revenue', { ascending: false });

  if (error || !data) {
    return [];
  }

  const rollups = data.map(normalizeRollup);
  venueRollupCache.set(key, { data: rollups, ts: Date.now() });
  return rollups;
}

/**
 * Get the most recent rollup date for an org.
 * Falls back to today if no rollups exist yet.
 */
export async function getLatestRollupDate(orgId: string): Promise<string> {
  const supabase = getServiceClient();
  const { data } = await (supabase as any)
    .from('enforcement_portfolio_rollups')
    .select('rollup_date')
    .eq('org_id', orgId)
    .is('venue_id', null)
    .order('rollup_date', { ascending: false })
    .limit(1)
    .single();

  if (data?.rollup_date) {
    return data.rollup_date;
  }

  // No rollups yet — return yesterday
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Get portfolio rollups for a date range (trend view).
 */
export async function getPortfolioRollupRange(
  orgId: string,
  startDate: string,
  endDate: string
): Promise<PortfolioRollup[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('enforcement_portfolio_rollups')
    .select('*')
    .eq('org_id', orgId)
    .is('venue_id', null)
    .gte('rollup_date', startDate)
    .lte('rollup_date', endDate)
    .order('rollup_date', { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map(normalizeRollup);
}

/**
 * Trigger rollup recomputation via the database function.
 * Called by the cron endpoint after nightly syncs complete.
 */
export async function recomputeRollups(
  orgId: string,
  date: string
): Promise<{ count: number; error?: string }> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any).rpc(
    'recompute_enforcement_rollups',
    { p_org_id: orgId, p_date: date }
  );

  if (error) {
    console.error('[rollups] Recompute error:', error);
    return { count: 0, error: error.message };
  }

  // Invalidate caches for this org/date
  const key = cacheKey(orgId, date);
  rollupCache.delete(key);
  venueRollupCache.delete(key);

  return { count: data ?? 0 };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function normalizeRollup(row: any): PortfolioRollup {
  return {
    id: row.id,
    org_id: row.org_id,
    venue_id: row.venue_id,
    rollup_date: row.rollup_date,
    attestation_expected: row.attestation_expected ?? 0,
    attestation_submitted: row.attestation_submitted ?? 0,
    attestation_late: row.attestation_late ?? 0,
    attestation_missed: row.attestation_missed ?? 0,
    attestation_compliance_pct: parseFloat(row.attestation_compliance_pct ?? '0'),
    carry_forward_count: row.carry_forward_count ?? 0,
    critical_open_count: row.critical_open_count ?? 0,
    escalated_count: row.escalated_count ?? 0,
    comp_exception_count: row.comp_exception_count ?? 0,
    labor_exception_count: row.labor_exception_count ?? 0,
    procurement_exception_count: row.procurement_exception_count ?? 0,
    revenue_variance_count: row.revenue_variance_count ?? 0,
    total_net_revenue: parseFloat(row.total_net_revenue ?? '0'),
    total_covers: row.total_covers ?? 0,
    avg_check: parseFloat(row.avg_check ?? '0'),
    total_labor_cost: parseFloat(row.total_labor_cost ?? '0'),
    labor_pct: parseFloat(row.labor_pct ?? '0'),
    top_venues_json: row.top_venues_json ?? null,
    computed_at: row.computed_at,
    compute_duration_ms: row.compute_duration_ms,
  };
}
