/**
 * Standalone Review Backfill Script
 * Runs directly with Node.js — no Next.js build required.
 *
 * Usage: node scripts/run-review-backfill.mjs
 */

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TIPSEE_CONFIG = {
  host: process.env.TIPSEE_DB_HOST || 'TIPSEE_HOST_REDACTED',
  user: process.env.TIPSEE_DB_USER,
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const pool = new pg.Pool(TIPSEE_CONFIG);

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getVenueMappings() {
  const { data, error } = await supabase
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid, venues!inner(name)')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch venue mappings:', error.message);
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(row.tipsee_location_uuid, row.venue_id);
  }
  return map;
}

function deriveReplyFields(replies) {
  if (!replies || typeof replies !== 'object') return { has_reply: false, reply_count: 0 };
  const keys = Object.keys(replies);
  if (keys.length === 0) return { has_reply: false, reply_count: 0 };
  if (Array.isArray(replies.replies)) return { has_reply: replies.replies.length > 0, reply_count: replies.replies.length };
  if (replies.text || replies.content || replies.comment) return { has_reply: true, reply_count: 1 };
  return { has_reply: keys.length > 0, reply_count: keys.length > 0 ? 1 : 0 };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const t0 = Date.now();
  console.log('=== Review Backfill ===\n');

  // 1. Get venue mappings
  const locationMap = await getVenueMappings();
  console.log(`Venues mapped: ${locationMap.size}`);
  if (locationMap.size === 0) {
    console.error('No venue mappings found. Exiting.');
    process.exit(1);
  }

  // 2. Extract ALL reviews from TipSee
  console.log('Extracting reviews from TipSee...');
  const result = await pool.query(
    `SELECT
      id, review_id, source, location_uuid::text,
      rating, review_date, tags, thirdparty_id,
      thirdparty_url, content, replies
    FROM public.reviews
    WHERE review_date >= '2020-01-01'
    ORDER BY review_date ASC`
  );
  console.log(`Extracted: ${result.rows.length} reviews\n`);

  // 3. Transform + upsert in batches
  let upserted = 0;
  let skipped = 0;
  const affectedVenues = new Set();
  const BATCH_SIZE = 100;

  for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
    const batch = result.rows.slice(i, i + BATCH_SIZE);
    const rows = [];

    for (const review of batch) {
      const venueId = locationMap.get(review.location_uuid);
      if (!venueId) { skipped++; continue; }

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
      const { error } = await supabase
        .from('reviews_raw')
        .upsert(rows, { onConflict: 'source,source_review_id' });

      if (error) {
        console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      } else {
        upserted += rows.length;
        process.stdout.write(`\r  Upserted: ${upserted} / ${result.rows.length}`);
      }
    }
  }

  console.log(`\n\nUpserted ${upserted} reviews across ${affectedVenues.size} venues (${skipped} skipped — unmapped)\n`);

  // 4. Recompute review signals for all venues
  console.log('Computing review signals...');
  const today = new Date().toISOString().split('T')[0];
  let rollupOk = 0;
  let rollupFail = 0;

  for (const venueId of affectedVenues) {
    const { error } = await supabase.rpc('compute_review_signals', {
      p_venue_id: venueId,
      p_start_date: '2023-01-01',
      p_end_date: today,
    });

    if (error) {
      console.error(`  Rollup error for ${venueId}:`, error.message);
      rollupFail++;
    } else {
      rollupOk++;
    }
  }
  console.log(`Rollups: ${rollupOk} OK, ${rollupFail} failed`);

  // 5. Trigger health recomputation
  console.log('\nRecomputing venue health scores...');
  const { data: healthResult, error: healthError } = await supabase.rpc('compute_all_venue_health');
  if (healthError) {
    console.error('Health recomputation error:', healthError.message);
  } else {
    console.log('Health scores recomputed:', JSON.stringify(healthResult, null, 2));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s ===`);

  await pool.end();
}

run().catch(err => {
  console.error('Fatal:', err);
  pool.end();
  process.exit(1);
});
