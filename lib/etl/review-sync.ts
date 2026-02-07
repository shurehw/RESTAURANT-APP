/**
 * Review ETL Sync
 * Extracts review data from TipSee (Widewail) and loads into reviews_raw + rollups.
 *
 * Sources: GOOGLE, OPEN_TABLE, YELP
 * Strategy: Incremental watermark on review_date with 48h safety overlap.
 * No author PII synced. Replies reduced to has_reply + reply_count.
 */

import { createHash } from 'crypto';
import { getTipseePool } from '@/lib/database/tipsee';
import { getServiceClient } from '@/lib/supabase/service';
import { getVenueTipseeMappings } from '@/lib/etl/tipsee-sync';

// 48-hour overlap window catches late-arriving reviews and reply updates
const OVERLAP_HOURS = 48;

export interface ReviewSyncResult {
  success: boolean;
  venue_count: number;
  reviews_extracted: number;
  reviews_upserted: number;
  rollup_dates: number;
  duration_ms: number;
  error?: string;
}

interface TipseeReview {
  id: number;
  review_id: string;
  source: string;
  location_uuid: string;
  rating: number;
  review_date: string;
  tags: string[] | null;
  thirdparty_id: string | null;
  thirdparty_url: string | null;
  content: string | null;
  replies: Record<string, unknown> | null;
}

/**
 * Build a reverse lookup: tipsee_location_uuid → venue_id
 */
async function buildLocationMap(): Promise<Map<string, string>> {
  const mappings = await getVenueTipseeMappings();
  const map = new Map<string, string>();
  for (const m of mappings) {
    map.set(m.tipsee_location_uuid, m.venue_id);
  }
  return map;
}

/**
 * Get the high-watermark: latest reviewed_at in reviews_raw.
 * Falls back to 2023-01-01 for initial sync.
 */
async function getWatermark(): Promise<string> {
  const supabase = getServiceClient();
  const { data } = await (supabase as any)
    .from('reviews_raw')
    .select('reviewed_at')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .single();

  if (data?.reviewed_at) {
    // Subtract overlap window
    const watermark = new Date(data.reviewed_at);
    watermark.setHours(watermark.getHours() - OVERLAP_HOURS);
    return watermark.toISOString();
  }

  return '2023-01-01T00:00:00Z';
}

/**
 * Extract reviews from TipSee since the watermark.
 */
async function extractReviews(since: string): Promise<TipseeReview[]> {
  const pool = getTipseePool();
  const result = await pool.query(
    `SELECT
      id,
      review_id,
      source,
      location_uuid::text,
      rating,
      review_date,
      tags,
      thirdparty_id,
      thirdparty_url,
      content,
      replies
    FROM public.reviews
    WHERE review_date >= $1
    ORDER BY review_date ASC`,
    [since]
  );
  return result.rows;
}

/**
 * Derive reply fields from the JSONB replies column.
 * TipSee stores replies as an object (empty = {}).
 */
function deriveReplyFields(replies: Record<string, unknown> | null): {
  has_reply: boolean;
  reply_count: number;
} {
  if (!replies || typeof replies !== 'object') {
    return { has_reply: false, reply_count: 0 };
  }

  // Check for common Widewail reply structures
  // Could be { "text": "...", "date": "..." } or { "replies": [...] } or just {}
  const keys = Object.keys(replies);
  if (keys.length === 0) {
    return { has_reply: false, reply_count: 0 };
  }

  // If it has an array of replies
  if (Array.isArray(replies.replies)) {
    return { has_reply: replies.replies.length > 0, reply_count: replies.replies.length };
  }

  // If it has text/content directly, it IS a reply
  if (replies.text || replies.content || replies.comment) {
    return { has_reply: true, reply_count: 1 };
  }

  // Non-empty object with other keys — assume it's a reply
  return { has_reply: keys.length > 0, reply_count: keys.length > 0 ? 1 : 0 };
}

/**
 * Sync all reviews incrementally.
 */
export async function syncReviews(): Promise<ReviewSyncResult> {
  const startTime = Date.now();
  const supabase = getServiceClient();

  try {
    // 1. Build location → venue mapping
    const locationMap = await buildLocationMap();
    if (locationMap.size === 0) {
      return {
        success: true,
        venue_count: 0,
        reviews_extracted: 0,
        reviews_upserted: 0,
        rollup_dates: 0,
        duration_ms: Date.now() - startTime,
        error: 'No venue-TipSee mappings found',
      };
    }

    // 2. Get watermark
    const since = await getWatermark();
    console.log(`[review-sync] Extracting reviews since ${since} (${OVERLAP_HOURS}h overlap)`);

    // 3. Extract from TipSee
    const tipseeReviews = await extractReviews(since);
    console.log(`[review-sync] Extracted ${tipseeReviews.length} reviews from TipSee`);

    if (tipseeReviews.length === 0) {
      return {
        success: true,
        venue_count: 0,
        reviews_extracted: 0,
        reviews_upserted: 0,
        rollup_dates: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 4. Transform and upsert
    let upserted = 0;
    const affectedVenues = new Set<string>();
    const affectedDates = new Set<string>(); // venue_id:date

    // Batch upserts in chunks of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < tipseeReviews.length; i += BATCH_SIZE) {
      const batch = tipseeReviews.slice(i, i + BATCH_SIZE);
      const rows = [];

      for (const review of batch) {
        const venueId = locationMap.get(review.location_uuid);
        if (!venueId) continue; // Skip unmapped locations

        const { has_reply, reply_count } = deriveReplyFields(review.replies);
        const contentHash = review.content
          ? createHash('sha256').update(review.content).digest('hex').substring(0, 16)
          : null;

        const reviewDate = new Date(review.review_date);
        const dateStr = reviewDate.toISOString().split('T')[0];

        affectedVenues.add(venueId);
        affectedDates.add(`${venueId}:${dateStr}`);

        rows.push({
          source_review_id: review.review_id,
          source: review.source,
          venue_id: venueId,
          rating: review.rating,
          reviewed_at: review.review_date,
          thirdparty_id: review.thirdparty_id,
          thirdparty_url: review.thirdparty_url,
          tags: review.tags || [],
          has_reply,
          reply_count,
          content: review.content,
          content_hash: contentHash,
          tipsee_id: review.id,
          ingested_at: new Date().toISOString(),
        });
      }

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from('reviews_raw')
          .upsert(rows, { onConflict: 'source,source_review_id' });

        if (error) {
          console.error(`[review-sync] Upsert batch error:`, error.message);
        } else {
          upserted += rows.length;
        }
      }
    }

    console.log(`[review-sync] Upserted ${upserted} reviews across ${affectedVenues.size} venues`);

    // 5. Recompute rollups for affected dates
    let rollupCount = 0;
    for (const venueId of affectedVenues) {
      // Find date range for this venue
      const venueDates = [...affectedDates]
        .filter(d => d.startsWith(venueId + ':'))
        .map(d => d.split(':')[1])
        .sort();

      if (venueDates.length === 0) continue;

      const minDate = venueDates[0];
      const maxDate = venueDates[venueDates.length - 1];

      const { error } = await (supabase as any).rpc('compute_review_signals', {
        p_venue_id: venueId,
        p_start_date: minDate,
        p_end_date: maxDate,
      });

      if (error) {
        console.error(`[review-sync] Rollup error for ${venueId}:`, error.message);
      } else {
        rollupCount += venueDates.length;
      }
    }

    console.log(`[review-sync] Computed rollups for ${rollupCount} venue-dates`);

    return {
      success: true,
      venue_count: affectedVenues.size,
      reviews_extracted: tipseeReviews.length,
      reviews_upserted: upserted,
      rollup_dates: rollupCount,
      duration_ms: Date.now() - startTime,
    };

  } catch (error: any) {
    console.error('[review-sync] Fatal error:', error);
    return {
      success: false,
      venue_count: 0,
      reviews_extracted: 0,
      reviews_upserted: 0,
      rollup_dates: 0,
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Full backfill: sync ALL reviews regardless of watermark.
 */
export async function backfillReviews(): Promise<ReviewSyncResult> {
  const startTime = Date.now();
  const supabase = getServiceClient();

  try {
    const locationMap = await buildLocationMap();
    console.log(`[review-sync] Backfill: extracting ALL reviews`);

    const tipseeReviews = await extractReviews('2020-01-01T00:00:00Z');
    console.log(`[review-sync] Backfill: ${tipseeReviews.length} total reviews`);

    // Reuse the same logic as syncReviews but with all reviews
    let upserted = 0;
    const affectedVenues = new Set<string>();
    const BATCH_SIZE = 100;

    for (let i = 0; i < tipseeReviews.length; i += BATCH_SIZE) {
      const batch = tipseeReviews.slice(i, i + BATCH_SIZE);
      const rows = [];

      for (const review of batch) {
        const venueId = locationMap.get(review.location_uuid);
        if (!venueId) continue;

        const { has_reply, reply_count } = deriveReplyFields(review.replies);
        const contentHash = review.content
          ? createHash('sha256').update(review.content).digest('hex').substring(0, 16)
          : null;

        affectedVenues.add(venueId);

        rows.push({
          source_review_id: review.review_id,
          source: review.source,
          venue_id: venueId,
          rating: review.rating,
          reviewed_at: review.review_date,
          thirdparty_id: review.thirdparty_id,
          thirdparty_url: review.thirdparty_url,
          tags: review.tags || [],
          has_reply,
          reply_count,
          content: review.content,
          content_hash: contentHash,
          tipsee_id: review.id,
          ingested_at: new Date().toISOString(),
        });
      }

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from('reviews_raw')
          .upsert(rows, { onConflict: 'source,source_review_id' });

        if (error) {
          console.error(`[review-sync] Backfill batch error:`, error.message);
        } else {
          upserted += rows.length;
        }
      }
    }

    // Recompute rollups for ALL venues, full date range
    let rollupCount = 0;
    for (const venueId of affectedVenues) {
      const { error } = await (supabase as any).rpc('compute_review_signals', {
        p_venue_id: venueId,
        p_start_date: '2023-01-01',
        p_end_date: new Date().toISOString().split('T')[0],
      });

      if (error) {
        console.error(`[review-sync] Backfill rollup error for ${venueId}:`, error.message);
      } else {
        rollupCount++;
      }
    }

    return {
      success: true,
      venue_count: affectedVenues.size,
      reviews_extracted: tipseeReviews.length,
      reviews_upserted: upserted,
      rollup_dates: rollupCount,
      duration_ms: Date.now() - startTime,
    };

  } catch (error: any) {
    console.error('[review-sync] Backfill error:', error);
    return {
      success: false,
      venue_count: 0,
      reviews_extracted: 0,
      reviews_upserted: 0,
      rollup_dates: 0,
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}
