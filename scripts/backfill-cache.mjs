/**
 * Backfill TipSee cache for date range
 * Usage: node scripts/backfill-cache.mjs 2026-01-01 2026-02-09
 */

import { SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET } from './_config.mjs';
const SUPABASE_KEY = SUPABASE_SERVICE_KEY;
const API_BASE = 'https://opsos-restaurant-app.vercel.app';

const VENUES = [
  { name: 'The Nice Guy', uuid: 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4' },
  { name: 'Delilah LA', uuid: 'f7a049ac-cf43-42b6-9083-b35d1848b24f' },
  { name: 'Keys Los Angeles', uuid: '42b1f4ed-d49a-4ed1-bf0f-75787f08a20f' },
  { name: 'Poppy', uuid: '69db05dd-aabc-4d9a-a11f-fdc09d4e3123' },
  { name: 'Bird Streets Club', uuid: '5c4a4913-bca0-426f-8b51-54e175ea609f' },
  { name: 'Delilah Miami', uuid: 'f1e2158b-e567-4a1c-8750-2e826bdf1a2b' },
  { name: 'Didi Events', uuid: '9cff9179-c87f-40f1-924b-d8df2edaeb06' },
];

async function checkCached(date, retries = 3) {
  const url = `${SUPABASE_URL}/rest/v1/tipsee_nightly_cache?select=venue_id&business_date=eq.${date}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      const data = await res.json();
      return new Set(Array.isArray(data) ? data.map(d => d.venue_id) : []);
    } catch (error) {
      console.error(`  ⚠️  checkCached attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) {
        throw error; // Rethrow on final attempt
      }
      // Exponential backoff: wait 2^attempt seconds
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

async function syncVenue(date, venue, retries = 2) {
  const url = `${API_BASE}/api/cron/sync-tipsee?date=${date}&venue=${venue.uuid}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const t0 = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
        signal: AbortSignal.timeout(120000), // 120 seconds timeout
      });

      const data = await res.json();
      const duration = ((Date.now() - t0) / 1000).toFixed(1);

      if (data.success && data.venuesSynced === 1) {
        return { success: true, duration };
      } else {
        // API returned error - don't retry
        return { success: false, error: data.message || 'Unknown error', duration };
      }
    } catch (error) {
      const duration = ((Date.now() - t0) / 1000).toFixed(1);

      // Network/timeout errors - retry
      if (attempt < retries && (error.name === 'AbortError' || error.message.includes('fetch failed'))) {
        console.log(`    ⚠️  ${venue.name} attempt ${attempt}/${retries} failed (${error.message}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay before retry
        continue;
      }

      return { success: false, error: error.message, duration };
    }
  }
}

async function backfillDate(date) {
  console.log(`\n=== ${date} ===`);

  // Check what's already cached (with retry logic)
  let cached;
  try {
    cached = await checkCached(date);
  } catch (error) {
    console.error(`❌ Failed to check cached status: ${error.message}`);
    console.log(`⏭️  Skipping ${date} - will retry in next run`);
    return { success: 0, failed: VENUES.length, skipped: 0 };
  }

  const uncachedVenues = VENUES.filter(v => !cached.has(v.uuid));

  if (uncachedVenues.length === 0) {
    console.log(`✅ All ${VENUES.length} venues already cached`);
    return { success: 0, failed: 0, skipped: VENUES.length };
  }

  console.log(`${cached.size}/${VENUES.length} cached, syncing ${uncachedVenues.length} venues...`);

  // Sync venues SEQUENTIALLY to avoid overloading TipSee API
  let success = 0;
  let failed = 0;

  for (const venue of uncachedVenues) {
    const result = await syncVenue(date, venue);
    if (result.success) {
      console.log(`  ✅ ${venue.name.padEnd(20)} ${result.duration}s`);
      success++;
    } else {
      console.log(`  ❌ ${venue.name.padEnd(20)} ${result.error}`);
      failed++;
    }

    // Add 1 second delay between venues to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { success, failed, skipped: cached.size };
}

function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function main() {
  const [startDate, endDate] = process.argv.slice(2);

  if (!startDate || !endDate) {
    console.error('Usage: node scripts/backfill-cache.mjs <start-date> <end-date>');
    console.error('Example: node scripts/backfill-cache.mjs 2026-01-01 2026-02-09');
    process.exit(1);
  }

  const dates = getDateRange(startDate, endDate);
  console.log(`\n🔄 Backfilling ${dates.length} dates (${dates[0]} → ${dates[dates.length - 1]})`);
  console.log(`   ${VENUES.length} venues × ${dates.length} dates = ${dates.length * VENUES.length} max syncs\n`);

  const startTime = Date.now();
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const date of dates) {
    const result = await backfillDate(date);
    totalSuccess += result.success;
    totalFailed += result.failed;
    totalSkipped += result.skipped;
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n=== Summary ===`);
  console.log(`✅ Success: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`⏭️  Skipped: ${totalSkipped} (already cached)`);
  console.log(`⏱️  Total time: ${totalTime} minutes`);
  console.log(`📊 Rate: ${(totalSuccess / (Date.now() - startTime) * 60000).toFixed(1)} syncs/minute`);
}

main().catch(console.error);
