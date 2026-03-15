/**
 * Server Score Actions
 *
 * Generates manager_actions from server performance scores.
 * Creates coaching/recognition actions based on score tiers:
 *   - at_risk (< 40): high priority coaching action
 *   - developing (40-55): medium priority coaching action
 *   - exceptional (85+): recognition action (positive reinforcement)
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getLatestServerScores, type ServerScore } from '@/lib/database/server-scores';

export async function saveServerScoreActions(
  venueId: string,
  businessDate: string,
  venueName: string
): Promise<{ success: boolean; actionsCreated: number; errors?: string[] }> {
  const scores = await getLatestServerScores(venueId);
  if (scores.length === 0) return { success: true, actionsCreated: 0 };

  const supabase = getServiceClient();
  const errors: string[] = [];
  let actionsCreated = 0;

  for (const score of scores) {
    const action = buildActionFromScore(score, businessDate, venueName);
    if (!action) continue;

    const { error } = await (supabase as any)
      .from('manager_actions')
      .insert(action);

    if (error) {
      // Skip duplicate actions (same server + same date + same source_type)
      if (error.code === '23505') continue;
      errors.push(`Failed to save score action for ${score.server_name}: ${error.message}`);
    } else {
      actionsCreated++;
    }
  }

  return {
    success: errors.length === 0,
    actionsCreated,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function buildActionFromScore(
  score: ServerScore,
  businessDate: string,
  venueName: string
): Record<string, any> | null {
  const cd = score.component_data;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (score.score_tier === 'at_risk') {
    const weakAreas = getWeakAreas(score);
    return {
      venue_id: score.venue_id,
      business_date: businessDate,
      source_report: `server_score_${businessDate}`,
      source_type: 'ai_server_score',
      priority: 'high',
      category: 'training',
      title: `Performance alert: ${score.server_name} (score: ${score.composite_score})`,
      description: `${score.server_name} is scoring ${score.composite_score}/100 over the last ${score.window_days} days (${score.shifts_in_window} shifts, ${score.covers_in_window} covers). Weak areas: ${weakAreas.join(', ')}.`,
      action: `Schedule a 1-on-1 with ${score.server_name} to review performance. Focus on: ${weakAreas[0] || 'overall improvement'}.`,
      assigned_role: 'manager',
      related_employees: [score.server_name],
      metadata: {
        venue_name: venueName,
        ai_generated: true,
        score_tier: score.score_tier,
        composite_score: score.composite_score,
        component_data: cd,
      },
      status: 'pending',
      expires_at: expiresAt,
    };
  }

  if (score.score_tier === 'developing') {
    const weakAreas = getWeakAreas(score);
    return {
      venue_id: score.venue_id,
      business_date: businessDate,
      source_report: `server_score_${businessDate}`,
      source_type: 'ai_server_score',
      priority: 'medium',
      category: 'training',
      title: `Coaching opportunity: ${score.server_name} (score: ${score.composite_score})`,
      description: `${score.server_name} is scoring ${score.composite_score}/100 over ${score.shifts_in_window} shifts. Areas to develop: ${weakAreas.join(', ')}.`,
      action: `Quick pre-shift coaching with ${score.server_name}: focus on ${weakAreas[0] || 'consistency'}.`,
      assigned_role: 'manager',
      related_employees: [score.server_name],
      metadata: {
        venue_name: venueName,
        ai_generated: true,
        score_tier: score.score_tier,
        composite_score: score.composite_score,
      },
      status: 'pending',
      expires_at: expiresAt,
    };
  }

  if (score.score_tier === 'exceptional') {
    return {
      venue_id: score.venue_id,
      business_date: businessDate,
      source_report: `server_score_${businessDate}`,
      source_type: 'ai_server_score',
      priority: 'low',
      category: 'recognition',
      title: `Top performer: ${score.server_name} (score: ${score.composite_score})`,
      description: `${score.server_name} is scoring ${score.composite_score}/100 — exceptional performance over ${score.shifts_in_window} shifts and ${score.covers_in_window} covers.`,
      action: `Recognize ${score.server_name} in pre-shift. Consider for section upgrades or mentoring newer staff.`,
      assigned_role: 'manager',
      related_employees: [score.server_name],
      metadata: {
        venue_name: venueName,
        ai_generated: true,
        score_tier: score.score_tier,
        composite_score: score.composite_score,
      },
      status: 'pending',
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // strong and solid = no action needed
  return null;
}

/**
 * Identify weakest scoring components for a server.
 */
function getWeakAreas(score: ServerScore): string[] {
  const components: Array<{ name: string; value: number | null }> = [
    { name: 'revenue per cover', value: score.revenue_per_cover_score },
    { name: 'tip percentage', value: score.tip_pct_score },
    { name: 'turn time', value: score.turn_time_score },
    { name: 'comp rate', value: score.comp_rate_score },
    { name: 'consistency', value: score.consistency_score },
    { name: 'manager feedback', value: score.manager_sentiment_score },
    { name: 'guest reviews', value: score.guest_review_score },
  ];

  return components
    .filter(c => c.value != null && c.value < 40)
    .sort((a, b) => (a.value ?? 100) - (b.value ?? 100))
    .map(c => c.name)
    .slice(0, 3);
}
