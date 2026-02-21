/**
 * Enforcement Scores API — OPERATOR ONLY
 *
 * Returns composite enforcement scores (manager reliability + venue discipline)
 * with trend data over a configurable window.
 *
 * GET /api/enforcement/scores?org_id=...&entity_type=manager|venue&days=30
 *
 * Optional params:
 *   entity_id    — filter to a single entity
 *   limit        — max results (default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Role check: only owner/admin in the org
async function checkOperatorAccess(
  request: NextRequest,
  orgId: string,
): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { authorized: false, error: 'Missing authorization' };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  const { getServiceClient } = await import('@/lib/supabase/service');
  const service = getServiceClient();

  const { data: orgUser } = await (service as any)
    .from('organization_users')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (!orgUser || !['owner', 'admin'].includes(orgUser.role)) {
    return { authorized: false, error: 'Insufficient permissions — owner or admin required' };
  }

  return { authorized: true, userId: user.id };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    const access = await checkOperatorAccess(request, orgId);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const entityType = searchParams.get('entity_type') || 'venue';
    const entityId = searchParams.get('entity_id');
    const days = parseInt(searchParams.get('days') || '30', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!['manager', 'venue'].includes(entityType)) {
      return NextResponse.json({ error: 'entity_type must be "manager" or "venue"' }, { status: 400 });
    }

    const { getServiceClient } = await import('@/lib/supabase/service');
    const supabase = getServiceClient() as any;

    // Get latest scores
    const today = new Date().toISOString().split('T')[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    let query = supabase
      .from('enforcement_scores')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .gte('business_date', cutoffStr)
      .order('business_date', { ascending: false });

    if (entityId) {
      query = query.eq('entity_id', entityId);
    }

    const { data: scores, error } = await query.limit(limit * days); // Get enough for trend

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by entity_id for trend computation
    const entityMap = new Map<string, {
      entity_id: string;
      entity_name: string | null;
      latest_score: number;
      latest_date: string;
      components: any;
      trend: Array<{ date: string; score: number }>;
      trend_direction: 'improving' | 'declining' | 'stable';
    }>();

    for (const score of scores || []) {
      const existing = entityMap.get(score.entity_id);
      if (!existing) {
        entityMap.set(score.entity_id, {
          entity_id: score.entity_id,
          entity_name: score.entity_name,
          latest_score: score.score,
          latest_date: score.business_date,
          components: score.components,
          trend: [{ date: score.business_date, score: score.score }],
          trend_direction: 'stable',
        });
      } else {
        existing.trend.push({ date: score.business_date, score: score.score });
        // Keep latest
        if (score.business_date > existing.latest_date) {
          existing.latest_score = score.score;
          existing.latest_date = score.business_date;
          existing.components = score.components;
        }
      }
    }

    // Compute trend direction
    for (const entity of entityMap.values()) {
      if (entity.trend.length >= 3) {
        // Compare first half avg to second half avg
        const sorted = entity.trend.sort((a, b) => a.date.localeCompare(b.date));
        const mid = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, mid);
        const secondHalf = sorted.slice(mid);
        const firstAvg = firstHalf.reduce((s, t) => s + t.score, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, t) => s + t.score, 0) / secondHalf.length;
        const diff = secondAvg - firstAvg;

        if (diff > 3) entity.trend_direction = 'improving';
        else if (diff < -3) entity.trend_direction = 'declining';
        else entity.trend_direction = 'stable';
      }

      // Sort trend chronologically
      entity.trend.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Sort by latest_score ascending (worst first)
    const result = Array.from(entityMap.values())
      .sort((a, b) => a.latest_score - b.latest_score)
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      entity_type: entityType,
      count: result.length,
      scores: result,
    });
  } catch (error: any) {
    console.error('[enforcement/scores] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 },
    );
  }
}
