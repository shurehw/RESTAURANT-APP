/**
 * Guest Reviews Data Access Layer
 *
 * Handles ingestion, dedup, and retrieval of guest reviews from
 * external platforms (Google, Yelp, OpenTable, TripAdvisor).
 */

import { getServiceClient } from '@/lib/supabase/service';
import { createHash } from 'crypto';

// ══════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════

export type ReviewSource = 'google' | 'yelp' | 'opentable' | 'tripadvisor' | 'manual';

export interface GuestReview {
  id: string;
  venue_id: string;
  source: ReviewSource;
  external_id: string | null;
  review_url: string | null;
  reviewer_name: string | null;
  rating: number | null;
  review_text: string;
  review_date: string;
  processed: boolean;
  processed_at: string | null;
  content_hash: string | null;
  created_at: string;
}

export interface IngestReviewInput {
  venue_id: string;
  source: ReviewSource;
  external_id?: string;
  review_url?: string;
  reviewer_name?: string;
  rating?: number;
  review_text: string;
  review_date: string; // YYYY-MM-DD
}

// ══════════════════════════════════════════════════════════════════════════
// Content hash for dedup (when external_id is not available)
// ══════════════════════════════════════════════════════════════════════════

function hashReviewContent(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

// ══════════════════════════════════════════════════════════════════════════
// Ingestion
// ══════════════════════════════════════════════════════════════════════════

/**
 * Ingest one or more guest reviews. Skips duplicates by external_id or content hash.
 * Returns the count of newly inserted reviews.
 */
export async function ingestReviews(
  reviews: IngestReviewInput[]
): Promise<{ inserted: number; skipped: number }> {
  const supabase = getServiceClient();
  let inserted = 0;
  let skipped = 0;

  for (const review of reviews) {
    const contentHash = hashReviewContent(review.review_text);

    const row = {
      venue_id: review.venue_id,
      source: review.source,
      external_id: review.external_id || null,
      review_url: review.review_url || null,
      reviewer_name: review.reviewer_name || null,
      rating: review.rating || null,
      review_text: review.review_text,
      review_date: review.review_date,
      content_hash: contentHash,
      processed: false,
    };

    const { error } = await (supabase as any)
      .from('guest_reviews')
      .upsert(row, {
        onConflict: review.external_id
          ? 'venue_id,source,external_id'
          : 'venue_id,content_hash',
        ignoreDuplicates: true,
      });

    if (error) {
      // Unique constraint violation = duplicate, skip it
      if (error.code === '23505') {
        skipped++;
      } else {
        console.error('Failed to ingest review:', error.message);
        skipped++;
      }
    } else {
      inserted++;
    }
  }

  return { inserted, skipped };
}

// ══════════════════════════════════════════════════════════════════════════
// Retrieval
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get unprocessed reviews for AI signal extraction.
 */
export async function getUnprocessedReviews(
  venueId: string,
  limit = 50
): Promise<GuestReview[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('guest_reviews')
    .select('*')
    .eq('venue_id', venueId)
    .eq('processed', false)
    .order('review_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch unprocessed reviews:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Mark reviews as processed after AI extraction.
 */
export async function markReviewsProcessed(reviewIds: string[]): Promise<void> {
  if (reviewIds.length === 0) return;

  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('guest_reviews')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .in('id', reviewIds);

  if (error) {
    console.error('Failed to mark reviews processed:', error.message);
  }
}

/**
 * Get recent reviews for a venue (for display/analytics).
 */
export async function getRecentReviews(
  venueId: string,
  days = 30,
  limit = 100
): Promise<GuestReview[]> {
  const supabase = getServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await (supabase as any)
    .from('guest_reviews')
    .select('*')
    .eq('venue_id', venueId)
    .gte('review_date', since.toISOString().split('T')[0])
    .order('review_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch recent reviews:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get review mention signals for a server (from attestation_signals).
 */
export async function getServerReviewMentions(
  venueId: string,
  serverName: string,
  days = 90
): Promise<any[]> {
  const supabase = getServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('*, guest_reviews(*)')
    .eq('venue_id', venueId)
    .eq('signal_type', 'guest_review_mention')
    .ilike('entity_name', serverName)
    .gte('business_date', since.toISOString().split('T')[0])
    .order('business_date', { ascending: false });

  if (error) {
    console.error('Failed to fetch server review mentions:', error.message);
    return [];
  }

  return data || [];
}
