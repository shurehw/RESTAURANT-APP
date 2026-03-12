/**
 * lib/database/pacing-recommendations.ts
 * Data access layer for AI-generated pacing recommendations.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export interface PacingRecommendation {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  rec_type: 'covers' | 'pacing' | 'turn_time' | 'channel';
  slot_label: string | null;
  current_value: Record<string, unknown>;
  recommended_value: Record<string, unknown>;
  reasoning: string;
  expected_impact: { extra_covers?: number; revenue_delta?: number };
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'dismissed' | 'expired' | 'applied';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  outcome: Record<string, unknown> | null;
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Get pending recommendations for a venue on a date.
 */
export async function getPendingForVenueDate(
  venueId: string,
  date: string,
): Promise<PacingRecommendation[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('pacing_recommendations')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pacing-recs] Failed to fetch:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get all recommendations for a venue on a date (any status).
 */
export async function getAllForVenueDate(
  venueId: string,
  date: string,
): Promise<PacingRecommendation[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('pacing_recommendations')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pacing-recs] Failed to fetch:', error.message);
    return [];
  }
  return data || [];
}

// ── CRUD ─────────────────────────────────────────────────────────

/**
 * Insert a new recommendation (deduplicates by venue+date+type+slot).
 */
export async function insertRecommendation(
  rec: Omit<PacingRecommendation, 'id' | 'status' | 'decided_by' | 'decided_at' | 'created_at' | 'outcome'>,
): Promise<PacingRecommendation | null> {
  const supabase = getServiceClient();

  // Check for existing pending rec of same type/slot
  const { data: existing } = await (supabase as any)
    .from('pacing_recommendations')
    .select('id')
    .eq('venue_id', rec.venue_id)
    .eq('business_date', rec.business_date)
    .eq('rec_type', rec.rec_type)
    .eq('status', 'pending')
    .is('slot_label', rec.slot_label ?? null)
    .maybeSingle();

  if (existing) {
    // Update existing recommendation instead of creating duplicate
    const { data, error } = await (supabase as any)
      .from('pacing_recommendations')
      .update({
        current_value: rec.current_value,
        recommended_value: rec.recommended_value,
        reasoning: rec.reasoning,
        expected_impact: rec.expected_impact,
        confidence: rec.confidence,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[pacing-recs] Failed to update:', error.message);
      return null;
    }
    return data;
  }

  const { data, error } = await (supabase as any)
    .from('pacing_recommendations')
    .insert(rec)
    .select()
    .single();

  if (error) {
    console.error('[pacing-recs] Failed to insert:', error.message);
    return null;
  }
  return data;
}

/**
 * Update recommendation status (accept/dismiss/apply).
 */
export async function updateRecommendationStatus(
  recId: string,
  status: 'accepted' | 'dismissed' | 'expired' | 'applied',
  userId?: string,
): Promise<boolean> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('pacing_recommendations')
    .update({
      status,
      decided_by: userId || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', recId)
    .eq('status', 'pending'); // Optimistic concurrency — only update if still pending

  if (error) {
    console.error('[pacing-recs] Failed to update status:', error.message);
    return false;
  }
  return true;
}

/**
 * Record outcome after a recommendation was applied.
 */
export async function recordOutcome(
  recId: string,
  outcome: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('pacing_recommendations')
    .update({ outcome, status: 'applied' })
    .eq('id', recId);

  if (error) {
    console.error('[pacing-recs] Failed to record outcome:', error.message);
  }
}

/**
 * Expire old pending recommendations for dates in the past.
 */
export async function expireOldRecommendations(): Promise<number> {
  const supabase = getServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any)
    .from('pacing_recommendations')
    .update({
      status: 'expired',
      decided_at: new Date().toISOString(),
    })
    .eq('status', 'pending')
    .lt('business_date', today)
    .select('id');

  if (error) {
    console.error('[pacing-recs] Failed to expire:', error.message);
    return 0;
  }
  return data?.length || 0;
}
