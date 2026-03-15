/**
 * Server Performance Scores — Rolling Composite Scoring
 *
 * Computes a 0–100 composite score per server from:
 *   - Revenue per cover vs team avg (25%)
 *   - Tip % vs team avg (20%)
 *   - Turn time vs team avg (15%)
 *   - Comp rate — lower is better (15%)
 *   - Guest review sentiment (10%)
 *   - Manager attestation sentiment (10%)
 *   - Consistency — low variance (5%)
 *
 * Runs nightly after attestation + review signal extraction.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════

export type ScoreTier = 'exceptional' | 'strong' | 'solid' | 'developing' | 'at_risk';

export interface ServerScore {
  id: string;
  venue_id: string;
  business_date: string;
  server_name: string;
  employee_id: string | null;
  composite_score: number;
  score_tier: ScoreTier;
  shifts_in_window: number;
  window_days: number;
  covers_in_window: number;
  component_data: ComponentData;

  // Component scores
  revenue_per_cover_score: number | null;
  tip_pct_score: number | null;
  turn_time_score: number | null;
  comp_rate_score: number | null;
  consistency_score: number | null;
  manager_sentiment_score: number | null;
  guest_review_score: number | null;
  greet_time_score: number | null;
}

interface ComponentData {
  revenue_per_cover: { value: number; team_avg: number } | null;
  tip_pct: { value: number; team_avg: number } | null;
  turn_time_mins: { value: number; team_avg: number } | null;
  comp_rate_pct: { value: number; team_avg: number } | null;
  manager_mentions: { positive: number; negative: number; total: number } | null;
  guest_reviews: { positive: number; negative: number; total: number } | null;
  greet_time_avg_sec: number | null;
  shifts: number;
  covers: number;
  total_revenue: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Weights
// ══════════════════════════════════════════════════════════════════════════

const WEIGHTS = {
  revenue_per_cover: 0.25,
  tip_pct: 0.20,
  turn_time: 0.15,
  comp_rate: 0.15,
  guest_reviews: 0.10,
  manager_sentiment: 0.10,
  consistency: 0.05,
} as const;

// Venues with auto service charge — tip % from payments is not meaningful
const AUTO_GRAT_VENUE_IDS = new Set([
  'a7da18a4-a70b-4492-abed-c9fed5851c9e', // Bird Streets Club
  '288b7f22-ffdc-4701-a396-a6b415aff0f1', // Delilah Miami
]);

// ══════════════════════════════════════════════════════════════════════════
// Scoring helpers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Score a metric where higher is better, relative to team average.
 * Returns 0–100 where 50 = exactly at team average.
 */
function scoreHigherIsBetter(value: number, teamAvg: number): number {
  if (teamAvg === 0) return 50;
  const ratio = value / teamAvg;
  // Map ratio to score: 0.5x avg = 0, 1.0x avg = 50, 1.5x+ avg = 100
  const score = Math.min(100, Math.max(0, (ratio - 0.5) * 100));
  return Math.round(score * 100) / 100;
}

/**
 * Score a metric where lower is better (turn time, comp rate, greet time).
 * Returns 0–100 where 50 = exactly at team average.
 */
function scoreLowerIsBetter(value: number, teamAvg: number): number {
  if (teamAvg === 0) return 50;
  const ratio = value / teamAvg;
  // Invert: 0.5x avg = 100, 1.0x avg = 50, 1.5x+ avg = 0
  const score = Math.min(100, Math.max(0, (1.5 - ratio) * 100));
  return Math.round(score * 100) / 100;
}

/**
 * Score sentiment from attestation/review mentions.
 * positive = good, negative = bad.
 */
function scoreSentiment(positive: number, negative: number, total: number): number {
  if (total === 0) return 50; // neutral baseline
  const ratio = (positive - negative) / total;
  // ratio: -1 (all negative) = 0, 0 (balanced) = 50, +1 (all positive) = 100
  return Math.round(((ratio + 1) / 2) * 100 * 100) / 100;
}

/**
 * Score consistency (low coefficient of variation = high score).
 */
function scoreConsistency(values: number[]): number {
  if (values.length < 3) return 50; // not enough data
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 50;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  // CV 0 = perfectly consistent (100), CV 0.5+ = very inconsistent (0)
  const score = Math.min(100, Math.max(0, (1 - cv * 2) * 100));
  return Math.round(score * 100) / 100;
}

function tierFromScore(score: number): ScoreTier {
  if (score >= 85) return 'exceptional';
  if (score >= 70) return 'strong';
  if (score >= 55) return 'solid';
  if (score >= 40) return 'developing';
  return 'at_risk';
}

// ══════════════════════════════════════════════════════════════════════════
// Data fetching
// ══════════════════════════════════════════════════════════════════════════

export type RoleCategory = 'server' | 'bartender' | 'host' | 'other';

interface ServerPosData {
  server_name: string;
  role_category: RoleCategory;
  shifts: number;
  total_covers: number;
  total_revenue: number;
  avg_per_cover: number;
  avg_tip_pct: number | null;
  avg_turn_mins: number | null;
  total_comps: number;
  per_cover_values: number[]; // for consistency scoring
}

function classifyRole(role: string | null): RoleCategory | null {
  if (!role) return 'server';
  const r = role.toLowerCase();
  // Exclude non-scoreable roles
  if (r.includes('manager') || r.includes('admin') || r.includes('valet') || r.includes('event') || r.includes('cover charge')) return null;
  if (r.includes('bartend') || r.includes('bar back') || r.includes('barback') || r.includes('service bar')) return 'bartender';
  if (r.includes('host') || r.includes('maitre')) return 'host';
  if (r.includes('server') || r.includes('waiter') || r.includes('waitress') || r.includes('captain')) return 'server';
  if (r.includes('busser') || r.includes('runner') || r.includes('sommelier')) return 'other';
  return 'server';
}

type TeamAvgs = { avg_per_cover: number; avg_tip_pct: number; avg_turn_mins: number; avg_comp_rate: number };

async function fetchServerPosData(
  venueId: string,
  sinceDate: string,
  untilDate: string
): Promise<{ servers: ServerPosData[]; roleAvgs: Map<RoleCategory, TeamAvgs> }> {
  const supabase = getServiceClient();

  // Read from server_day_facts (populated by TipSee ETL)
  const { data: facts, error } = await (supabase as any)
    .from('server_day_facts')
    .select('employee_name, employee_role, business_date, gross_sales, checks_count, covers_count, tips_total, comps_total, avg_turn_mins')
    .eq('venue_id', venueId)
    .gte('business_date', sinceDate)
    .lte('business_date', untilDate)
    .gt('covers_count', 0);

  if (error || !facts?.length) {
    return { servers: [], roleAvgs: new Map() };
  }

  // Aggregate daily facts by server across the window
  const serverMap = new Map<string, {
    covers: number;
    revenue: number;
    tips: number;
    comps: number;
    turnMinsWeighted: number;
    turnCovers: number;
    dates: Set<string>;
    perCoverByDay: number[];
    role_category: RoleCategory;
  }>();

  for (const row of facts) {
    const name = row.employee_name;
    if (!name) continue;
    const role = classifyRole(row.employee_role);
    if (!role) continue; // Skip managers, admins, valets, etc.
    if (!serverMap.has(name)) {
      serverMap.set(name, {
        covers: 0, revenue: 0, tips: 0, comps: 0,
        turnMinsWeighted: 0, turnCovers: 0, dates: new Set(),
        perCoverByDay: [],
        role_category: role,
      });
    }
    const s = serverMap.get(name)!
    const covers = row.covers_count || 0;
    const revenue = parseFloat(row.gross_sales) || 0;
    s.covers += covers;
    s.revenue += revenue;
    s.tips += parseFloat(row.tips_total) || 0;
    s.comps += parseFloat(row.comps_total) || 0;
    const turnMins = parseFloat(row.avg_turn_mins) || 0;
    if (turnMins > 0 && covers > 0) {
      s.turnMinsWeighted += turnMins * covers;
      s.turnCovers += covers;
    }
    s.dates.add(row.business_date);
    if (covers > 0) {
      s.perCoverByDay.push(revenue / covers);
    }
  }

  const servers: ServerPosData[] = [];

  // Accumulators per role for peer-group averages
  const roleAccum = new Map<RoleCategory, {
    covers: number; revenue: number; tips: number;
    turnWeighted: number; turnCovers: number; comps: number;
    serversWithTips: number;
  }>();

  for (const [name, s] of serverMap) {
    const avgPerCover = s.covers > 0 ? s.revenue / s.covers : 0;
    const avgTipPct = s.tips > 0 && s.revenue > 0 ? (s.tips / s.revenue) * 100 : null;
    const avgTurnMins = s.turnCovers > 0 ? s.turnMinsWeighted / s.turnCovers : null;

    servers.push({
      server_name: name,
      role_category: s.role_category,
      shifts: s.dates.size,
      total_covers: s.covers,
      total_revenue: s.revenue,
      avg_per_cover: avgPerCover,
      avg_tip_pct: avgTipPct,
      avg_turn_mins: avgTurnMins,
      total_comps: s.comps,
      per_cover_values: s.perCoverByDay,
    });

    // Accumulate per-role totals
    if (!roleAccum.has(s.role_category)) {
      roleAccum.set(s.role_category, {
        covers: 0, revenue: 0, tips: 0, turnWeighted: 0,
        turnCovers: 0, comps: 0, serversWithTips: 0,
      });
    }
    const ra = roleAccum.get(s.role_category)!;
    ra.covers += s.covers;
    ra.revenue += s.revenue;
    ra.tips += s.tips;
    if (s.tips > 0) ra.serversWithTips++;
    ra.turnWeighted += s.turnMinsWeighted;
    ra.turnCovers += s.turnCovers;
    ra.comps += s.comps;
  }

  // Compute per-role averages
  const roleAvgs = new Map<RoleCategory, TeamAvgs>();
  for (const [role, ra] of roleAccum) {
    roleAvgs.set(role, {
      avg_per_cover: ra.covers > 0 ? ra.revenue / ra.covers : 0,
      avg_tip_pct: ra.serversWithTips > 0 && ra.revenue > 0 ? (ra.tips / ra.revenue) * 100 : 0,
      avg_turn_mins: ra.turnCovers > 0 ? ra.turnWeighted / ra.turnCovers : 0,
      avg_comp_rate: ra.revenue > 0 ? (ra.comps / ra.revenue) * 100 : 0,
    });
  }

  return { servers, roleAvgs };
}

interface MentionCounts {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
}

async function fetchMentionCounts(
  venueId: string,
  sinceDate: string,
  untilDate: string,
  signalType: string
): Promise<Map<string, MentionCounts>> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('entity_name, mention_sentiment')
    .eq('venue_id', venueId)
    .eq('signal_type', signalType)
    .gte('business_date', sinceDate)
    .lte('business_date', untilDate)
    .not('entity_name', 'is', null);

  if (error || !data?.length) return new Map();

  const counts = new Map<string, MentionCounts>();
  for (const row of data) {
    const name = (row.entity_name as string).toLowerCase();
    if (!counts.has(name)) {
      counts.set(name, { positive: 0, negative: 0, neutral: 0, total: 0 });
    }
    const c = counts.get(name)!;
    c.total++;
    if (row.mention_sentiment === 'positive') c.positive++;
    else if (row.mention_sentiment === 'negative') c.negative++;
    else c.neutral++;
  }

  return counts;
}

// ══════════════════════════════════════════════════════════════════════════
// Main scoring function
// ══════════════════════════════════════════════════════════════════════════

/**
 * Compute and save server performance scores for a venue on a given date.
 * Uses a rolling window (default 30 days) of POS, attestation, and review data.
 */
export async function computeServerScores(
  venueId: string,
  businessDate: string,
  windowDays = 30
): Promise<{ scored: number; errors: string[] }> {
  const sinceDate = shiftDate(businessDate, -windowDays);
  const errors: string[] = [];

  // Fetch all data sources in parallel
  const [posResult, managerMentions, reviewMentions] = await Promise.all([
    fetchServerPosData(venueId, sinceDate, businessDate),
    fetchMentionCounts(venueId, sinceDate, businessDate, 'employee_mention'),
    fetchMentionCounts(venueId, sinceDate, businessDate, 'guest_review_mention'),
  ]);

  const { servers, roleAvgs } = posResult;

  if (servers.length === 0) {
    return { scored: 0, errors: ['No server POS data found in window'] };
  }

  const supabase = getServiceClient();
  let scored = 0;
  const defaultAvgs: TeamAvgs = { avg_per_cover: 0, avg_tip_pct: 0, avg_turn_mins: 0, avg_comp_rate: 0 };

  for (const server of servers) {
    // Minimum threshold: need at least 2 shifts to score
    if (server.shifts < 2) continue;

    const nameLower = server.server_name.toLowerCase();

    // Use peer-group averages (bartenders vs bartenders, servers vs servers)
    const peerAvgs = roleAvgs.get(server.role_category) || defaultAvgs;

    // --- Component scores ---

    const revenueScore = scoreHigherIsBetter(server.avg_per_cover, peerAvgs.avg_per_cover);

    // Skip tip % for auto-grat venues — payment tips are not meaningful
    const tipScore = AUTO_GRAT_VENUE_IDS.has(venueId) ? null
      : server.avg_tip_pct != null && peerAvgs.avg_tip_pct > 0
        ? scoreHigherIsBetter(server.avg_tip_pct, peerAvgs.avg_tip_pct)
        : null;

    const turnScore = server.avg_turn_mins != null && peerAvgs.avg_turn_mins > 0
      ? scoreLowerIsBetter(server.avg_turn_mins, peerAvgs.avg_turn_mins)
      : null;

    const serverCompRate = server.total_revenue > 0
      ? (server.total_comps / server.total_revenue) * 100
      : 0;
    const compScore = peerAvgs.avg_comp_rate > 0
      ? scoreLowerIsBetter(serverCompRate, peerAvgs.avg_comp_rate)
      : 50;

    const consistencyScoreVal = scoreConsistency(server.per_cover_values);

    // Manager mentions
    const mgr = managerMentions.get(nameLower);
    const mgrScore = mgr ? scoreSentiment(mgr.positive, mgr.negative, mgr.total) : null;

    // Guest review mentions
    const rev = reviewMentions.get(nameLower);
    const revScore = rev ? scoreSentiment(rev.positive, rev.negative, rev.total) : null;

    // --- Weighted composite ---
    // Only include components that have data; redistribute weights for missing components
    const components: Array<{ score: number; weight: number }> = [];
    components.push({ score: revenueScore, weight: WEIGHTS.revenue_per_cover });
    if (tipScore != null) components.push({ score: tipScore, weight: WEIGHTS.tip_pct });
    if (turnScore != null) components.push({ score: turnScore, weight: WEIGHTS.turn_time });
    components.push({ score: compScore, weight: WEIGHTS.comp_rate });
    if (revScore != null) components.push({ score: revScore, weight: WEIGHTS.guest_reviews });
    if (mgrScore != null) components.push({ score: mgrScore, weight: WEIGHTS.manager_sentiment });
    components.push({ score: consistencyScoreVal, weight: WEIGHTS.consistency });

    // Normalize weights to sum to 1.0
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    const composite = totalWeight > 0
      ? components.reduce((s, c) => s + c.score * (c.weight / totalWeight), 0)
      : 50;

    const roundedComposite = Math.round(composite * 100) / 100;
    const tier = tierFromScore(roundedComposite);

    const componentData: ComponentData = {
      revenue_per_cover: { value: server.avg_per_cover, team_avg: peerAvgs.avg_per_cover },
      tip_pct: server.avg_tip_pct != null ? { value: server.avg_tip_pct, team_avg: peerAvgs.avg_tip_pct } : null,
      turn_time_mins: server.avg_turn_mins != null ? { value: server.avg_turn_mins, team_avg: peerAvgs.avg_turn_mins } : null,
      comp_rate_pct: { value: serverCompRate, team_avg: peerAvgs.avg_comp_rate },
      manager_mentions: mgr ? { positive: mgr.positive, negative: mgr.negative, total: mgr.total } : null,
      guest_reviews: rev ? { positive: rev.positive, negative: rev.negative, total: rev.total } : null,
      greet_time_avg_sec: null, // future: from greeting_metrics
      shifts: server.shifts,
      covers: server.total_covers,
      total_revenue: server.total_revenue,
    };

    const row = {
      venue_id: venueId,
      business_date: businessDate,
      server_name: server.server_name,
      role_category: server.role_category,
      revenue_per_cover_score: revenueScore,
      tip_pct_score: tipScore,
      turn_time_score: turnScore,
      comp_rate_score: compScore,
      consistency_score: consistencyScoreVal,
      manager_sentiment_score: mgrScore,
      guest_review_score: revScore,
      greet_time_score: null,
      composite_score: roundedComposite,
      score_tier: tier,
      shifts_in_window: server.shifts,
      window_days: windowDays,
      covers_in_window: server.total_covers,
      component_data: componentData,
    };

    const { error } = await (supabase as any)
      .from('server_performance_scores')
      .upsert(row, { onConflict: 'venue_id,server_name,business_date,role_category' });

    if (error) {
      errors.push(`Failed to upsert score for ${server.server_name}: ${error.message}`);
    } else {
      scored++;
    }
  }

  return { scored, errors };
}

// ══════════════════════════════════════════════════════════════════════════
// Retrieval
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get latest scores for all servers at a venue.
 */
export async function getLatestServerScores(
  venueId: string
): Promise<ServerScore[]> {
  const supabase = getServiceClient();

  // Get the most recent business_date that has scores
  const { data: latest } = await (supabase as any)
    .from('server_performance_scores')
    .select('business_date')
    .eq('venue_id', venueId)
    .order('business_date', { ascending: false })
    .limit(1);

  if (!latest?.length) return [];

  const { data, error } = await (supabase as any)
    .from('server_performance_scores')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', latest[0].business_date)
    .order('composite_score', { ascending: false });

  if (error) {
    console.error('Failed to fetch server scores:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get score history for a specific server (for trend chart).
 */
export async function getServerScoreHistory(
  venueId: string,
  serverName: string,
  days = 90
): Promise<ServerScore[]> {
  const supabase = getServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await (supabase as any)
    .from('server_performance_scores')
    .select('*')
    .eq('venue_id', venueId)
    .eq('server_name', serverName)
    .gte('business_date', since.toISOString().split('T')[0])
    .order('business_date', { ascending: true });

  if (error) {
    console.error('Failed to fetch score history:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get scores by tier for a venue (for leaderboard/distribution).
 */
export async function getScoresByTier(
  venueId: string,
  businessDate: string
): Promise<Record<ScoreTier, number>> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('server_performance_scores')
    .select('score_tier')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate);

  if (error) return { exceptional: 0, strong: 0, solid: 0, developing: 0, at_risk: 0 };

  const counts: Record<ScoreTier, number> = { exceptional: 0, strong: 0, solid: 0, developing: 0, at_risk: 0 };
  for (const row of data || []) {
    if (row.score_tier in counts) counts[row.score_tier as ScoreTier]++;
  }
  return counts;
}

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
