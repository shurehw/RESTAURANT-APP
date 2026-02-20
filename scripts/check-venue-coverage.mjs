/**
 * Check which venues are missing from cache for Feb 7-8
 */

import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from './_config.mjs';
const SUPABASE_KEY = SUPABASE_SERVICE_KEY;

async function query(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function main() {
  // Get all active venue mappings
  const mappings = await query('venue_tipsee_mapping', 'select=venue_id,tipsee_location_name&is_active=eq.true');

  console.log('=== Active Venues ===');
  console.log(`Total venues: ${mappings.length}\n`);

  const venueMap = {};
  for (const m of mappings) {
    venueMap[m.venue_id] = m.tipsee_location_name;
  }

  // Check cache coverage for Feb 7 and 8
  for (const date of ['2026-02-07', '2026-02-08']) {
    console.log(`\n=== ${date} Cache Coverage ===`);

    const cached = await query('tipsee_nightly_cache', `select=venue_id&business_date=eq.${date}`);
    const cachedVenueIds = new Set(cached.map(c => c.venue_id));

    console.log(`Cached: ${cached.length}/${mappings.length} venues\n`);

    for (const [venueId, venueName] of Object.entries(venueMap)) {
      const status = cachedVenueIds.has(venueId) ? '✅' : '❌';
      console.log(`  ${status} ${venueName}`);
    }
  }
}

main().catch(console.error);
