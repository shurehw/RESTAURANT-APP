/**
 * Composite Enforcement Scoring
 *
 * Two scores computed nightly:
 * A. Manager Reliability Index (0-100) — per-manager behavioral accountability
 * B. Unit Discipline Score (0-100) — per-venue operational compliance
 *
 * Both stored in enforcement_scores with full component breakdowns.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getManagerSignalProfile } from '@/lib/database/signal-analytics';

// ============================================================================
// Types
// ============================================================================

interface ScoreComponents {
  [key: string]: { raw: number; weighted: number; weight: number };
}

interface ScoreResult {
  entity_id: string;
  entity_name: string | null;
  score: number;
  components: ScoreComponents;
}

// ============================================================================
// Main Entry
// ============================================================================

export interface ScoringResult {
  managers: number;
  venues: number;
  errors: string[];
}

/**
 * Compute and persist all enforcement scores for an organization.
 */
export async function computeEnforcementScores(
  orgId: string,
  businessDate: string,
): Promise<ScoringResult> {
  const result: ScoringResult = { managers: 0, venues: 0, errors: [] };
  const supabase = getServiceClient() as any;

  // A. Manager scores
  try {
    const managerScores = await computeManagerScores(supabase, orgId, businessDate);
    if (managerScores.length > 0) {
      const rows = managerScores.map(s => ({
        org_id: orgId,
        entity_type: 'manager',
        entity_id: s.entity_id,
        entity_name: s.entity_name,
        score: s.score,
        components: s.components,
        window_days: 30,
        business_date: businessDate,
      }));

      const { error } = await supabase
        .from('enforcement_scores')
        .upsert(rows, {
          onConflict: 'org_id,entity_type,entity_id,business_date',
        });

      if (error) {
        result.errors.push(`Manager scores upsert failed: ${error.message}`);
      } else {
        result.managers = managerScores.length;
      }
    }
  } catch (err: any) {
    result.errors.push(`Manager scoring failed: ${err.message}`);
  }

  // B. Venue scores
  try {
    const venueScores = await computeVenueScores(supabase, orgId, businessDate);
    if (venueScores.length > 0) {
      const rows = venueScores.map(s => ({
        org_id: orgId,
        entity_type: 'venue',
        entity_id: s.entity_id,
        entity_name: s.entity_name,
        score: s.score,
        components: s.components,
        window_days: 30,
        business_date: businessDate,
      }));

      const { error } = await supabase
        .from('enforcement_scores')
        .upsert(rows, {
          onConflict: 'org_id,entity_type,entity_id,business_date',
        });

      if (error) {
        result.errors.push(`Venue scores upsert failed: ${error.message}`);
      } else {
        result.venues = venueScores.length;
      }
    }
  } catch (err: any) {
    result.errors.push(`Venue scoring failed: ${err.message}`);
  }

  return result;
}

// ============================================================================
// A. Manager Reliability Index (0-100)
// ============================================================================

/**
 * Components:
 * - Follow-through rate    (25) — commitments fulfilled / closed
 * - Command score          (25) — avg overall_command_score / 10 × 25
 * - Avoidance discipline   (15) — 1 - avoidance_rate
 * - Blame accountability   (10) — 1 - blame_shift_rate
 * - Corrective action      (10) — corrective_action_rate
 * - Breach resolution speed(15) — avg time to resolve violations (capped 72h)
 *
 * Anti-gaming: breach_resolution is multiplied by action_quality_rate
 * (violations resolved via full ack→action→resolve path / total resolved).
 * Fast ack + garbage action doesn't score well.
 */
async function computeManagerScores(
  supabase: any,
  orgId: string,
  businessDate: string,
): Promise<ScoreResult[]> {
  // Get all managers who have submitted attestations in the last 30 days
  const cutoff = subtractDays(businessDate, 30);

  const { data: managers } = await supabase
    .from('nightly_attestations')
    .select('submitted_by, user_profiles!inner(id, full_name)')
    .eq('org_id', orgId)
    .gte('business_date', cutoff)
    .not('submitted_by', 'is', null);

  if (!managers || managers.length === 0) return [];

  // Deduplicate managers
  const uniqueManagers = new Map<string, string>();
  for (const m of managers) {
    if (m.submitted_by && !uniqueManagers.has(m.submitted_by)) {
      uniqueManagers.set(m.submitted_by, m.user_profiles?.full_name || null);
    }
  }

  const scores: ScoreResult[] = [];

  for (const [managerId, managerName] of uniqueManagers) {
    try {
      const score = await computeSingleManagerScore(supabase, orgId, managerId, managerName, businessDate);
      if (score) scores.push(score);
    } catch (err: any) {
      // Skip individual failures
      console.error(`[scoring] Manager ${managerId} failed:`, err.message);
    }
  }

  return scores;
}

async function computeSingleManagerScore(
  supabase: any,
  orgId: string,
  managerId: string,
  managerName: string | null,
  businessDate: string,
): Promise<ScoreResult | null> {
  const components: ScoreComponents = {};

  // 1. Get signal profile (follow-through, avoidance, blame, corrective)
  let profile;
  try {
    profile = await getManagerSignalProfile(managerId, { days: 30 });
  } catch {
    // No signals = skip
  }

  // Follow-through rate (weight: 25)
  const followThrough = profile?.follow_through_rate ?? 0;
  components.follow_through = {
    raw: followThrough,
    weighted: Math.round(followThrough * 25),
    weight: 25,
  };

  // Command score (weight: 25) — avg overall_command_score is 0-10
  const commandScore = profile?.avg_ownership?.overall_command_score ?? 0;
  const commandNormalized = Math.min(commandScore / 10, 1);
  components.command_score = {
    raw: commandScore,
    weighted: Math.round(commandNormalized * 25),
    weight: 25,
  };

  // Avoidance discipline (weight: 15) — lower avoidance = better
  const avoidanceRate = profile?.avoidance_rate ?? 0;
  const avoidanceDiscipline = 1 - avoidanceRate;
  components.avoidance_discipline = {
    raw: avoidanceDiscipline,
    weighted: Math.round(avoidanceDiscipline * 15),
    weight: 15,
  };

  // Blame accountability (weight: 10) — lower blame = better
  const blameRate = profile?.blame_shift_rate ?? 0;
  const blameAccountability = 1 - blameRate;
  components.blame_accountability = {
    raw: blameAccountability,
    weighted: Math.round(blameAccountability * 10),
    weight: 10,
  };

  // Corrective action rate (weight: 10)
  const correctiveRate = profile?.corrective_action_rate ?? 0;
  components.corrective_action = {
    raw: correctiveRate,
    weighted: Math.round(correctiveRate * 10),
    weight: 10,
  };

  // Breach resolution speed (weight: 15) — avg hours to resolve, capped at 72h
  // Gated by action quality: (full lifecycle resolutions / total resolutions)
  const cutoff = subtractDays(businessDate, 30);
  const { data: resolvedViolations } = await supabase
    .from('control_plane_violations')
    .select('detected_at, resolved_at, ack_at, action_at, action_summary, status')
    .eq('org_id', orgId)
    .eq('status', 'resolved')
    .gte('business_date', cutoff)
    .or(`metadata->>manager_name.eq.${managerName},metadata->>server_name.eq.${managerName}`);

  let resolutionScore = 0;
  let actionQualityRate = 1;
  if (resolvedViolations && resolvedViolations.length > 0) {
    const hours = resolvedViolations.map((v: any) => {
      const detected = new Date(v.detected_at).getTime();
      const resolved = new Date(v.resolved_at).getTime();
      return Math.max(0, (resolved - detected) / (1000 * 60 * 60));
    });
    const avgHours = hours.reduce((a: number, b: number) => a + b, 0) / hours.length;
    // <12h = 1.0, 72h+ = 0.0, linear in between
    resolutionScore = Math.max(0, Math.min(1, (72 - avgHours) / 60));

    // Action quality: count violations that went through full ack → action → resolve
    const fullLifecycle = resolvedViolations.filter(
      (v: any) => v.ack_at && v.action_at && v.action_summary
    ).length;
    actionQualityRate = fullLifecycle / resolvedViolations.length;
  } else {
    // No resolved violations = neutral (give partial credit)
    resolutionScore = 0.6;
  }

  // Multiply resolution score by action quality — fast ack + no real action doesn't score well
  const gatedResolutionScore = resolutionScore * actionQualityRate;

  components.breach_resolution = {
    raw: gatedResolutionScore,
    weighted: Math.round(gatedResolutionScore * 15),
    weight: 15,
  };

  // Total score
  const totalScore = Math.max(0, Math.min(100,
    Object.values(components).reduce((sum, c) => sum + c.weighted, 0)
  ));

  // Only score managers with enough data
  const hasData = (profile?.total_attestations ?? 0) >= 3;
  if (!hasData) return null;

  return {
    entity_id: managerId,
    entity_name: managerName,
    score: totalScore,
    components,
  };
}

// ============================================================================
// B. Unit Discipline Score (0-100)
// ============================================================================

/**
 * Components:
 * - Breach frequency (inverse) (30) — 0 violations = 30, 10+ = 0
 * - Resolution rate           (20) — resolved / total (waivers excluded from resolved)
 * - Avg resolution time       (15) — hours from detected to resolved
 * - Attestation compliance    (15) — submitted / expected
 * - Escalation rate (inverse) (15) — 1 - (escalated / total)
 * - Waiver discipline          (5) — 1 - (waived / total), waivers hurt this score
 */
async function computeVenueScores(
  supabase: any,
  orgId: string,
  businessDate: string,
): Promise<ScoreResult[]> {
  // Get all venues for this org
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  if (!venues || venues.length === 0) return [];

  const cutoff = subtractDays(businessDate, 30);
  const scores: ScoreResult[] = [];

  for (const venue of venues) {
    try {
      const score = await computeSingleVenueScore(supabase, orgId, venue.id, venue.name, cutoff, businessDate);
      scores.push(score);
    } catch (err: any) {
      console.error(`[scoring] Venue ${venue.id} failed:`, err.message);
    }
  }

  return scores;
}

async function computeSingleVenueScore(
  supabase: any,
  orgId: string,
  venueId: string,
  venueName: string,
  cutoff: string,
  businessDate: string,
): Promise<ScoreResult> {
  const components: ScoreComponents = {};

  // Fetch all violations for this venue in the window
  const { data: violations } = await supabase
    .from('control_plane_violations')
    .select('id, severity, detected_at, resolved_at, escalation_level, status')
    .eq('org_id', orgId)
    .eq('venue_id', venueId)
    .gte('business_date', cutoff);

  const allViolations = violations || [];
  const totalViolations = allViolations.length;
  const resolved = allViolations.filter((v: any) => v.status === 'resolved');
  const waived = allViolations.filter((v: any) => v.status === 'waived');
  const escalated = allViolations.filter((v: any) => (v.escalation_level || 0) > 0);

  // 1. Breach frequency (weight: 30) — 0 violations = 30, 10+ = 0
  const freqScore = Math.max(0, Math.min(1, (10 - totalViolations) / 10));
  components.breach_frequency = {
    raw: totalViolations,
    weighted: Math.round(freqScore * 30),
    weight: 30,
  };

  // 2. Resolution rate (weight: 20) — resolved / total (waivers excluded from "resolved")
  const resolutionRate = totalViolations > 0 ? resolved.length / totalViolations : 1;
  components.resolution_rate = {
    raw: resolutionRate,
    weighted: Math.round(resolutionRate * 20),
    weight: 20,
  };

  // 3. Avg resolution time (weight: 15)
  let avgResolutionScore = 1; // Default to perfect if no violations
  if (resolved.length > 0) {
    const hours = resolved.map((v: any) => {
      const detected = new Date(v.detected_at).getTime();
      const resolvedAt = new Date(v.resolved_at).getTime();
      return Math.max(0, (resolvedAt - detected) / (1000 * 60 * 60));
    });
    const avgHours = hours.reduce((a: number, b: number) => a + b, 0) / hours.length;
    avgResolutionScore = Math.max(0, Math.min(1, (72 - avgHours) / 60));
  }
  components.resolution_time = {
    raw: avgResolutionScore,
    weighted: Math.round(avgResolutionScore * 15),
    weight: 15,
  };

  // 4. Attestation compliance (weight: 15)
  // Count business days in the window and compare to submitted attestations
  const { count: attestationCount } = await supabase
    .from('nightly_attestations')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .gte('business_date', cutoff)
    .lte('business_date', businessDate)
    .not('submitted_at', 'is', null);

  // Approximate expected: ~26 business days in 30 calendar days (6 nights/week for restaurants)
  const expectedAttestations = 26;
  const complianceRate = Math.min(1, (attestationCount || 0) / expectedAttestations);
  components.attestation_compliance = {
    raw: complianceRate,
    weighted: Math.round(complianceRate * 15),
    weight: 15,
  };

  // 5. Escalation rate (inverse) (weight: 15) — lower escalation = better
  const escalationRate = totalViolations > 0 ? escalated.length / totalViolations : 0;
  const escalationScore = 1 - escalationRate;
  components.escalation_rate = {
    raw: escalationScore,
    weighted: Math.round(escalationScore * 15),
    weight: 15,
  };

  // 6. Waiver discipline (weight: 5) — waivers reduce venue score
  const waiverRate = totalViolations > 0 ? waived.length / totalViolations : 0;
  const waiverScore = 1 - waiverRate;
  components.waiver_discipline = {
    raw: waiverScore,
    weighted: Math.round(waiverScore * 5),
    weight: 5,
  };

  const totalScore = Math.max(0, Math.min(100,
    Object.values(components).reduce((sum, c) => sum + c.weighted, 0)
  ));

  return {
    entity_id: venueId,
    entity_name: venueName,
    score: totalScore,
    components,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
