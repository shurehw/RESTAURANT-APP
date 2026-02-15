/**
 * Check date range of cached data
 */

const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYzOTE3NCwiZXhwIjoyMDc4MjE1MTc0fQ.N4erm4GjP1AV8uDP2OVPBIdZnNtuofPmyLFdM2IVhXI';

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
  console.log('=== Historical Data Range ===\n');

  // Check cache table
  const cacheEarliest = await query('tipsee_nightly_cache', 'select=business_date&order=business_date.asc&limit=1');
  const cacheLatest = await query('tipsee_nightly_cache', 'select=business_date&order=business_date.desc&limit=1');
  const cacheTotal = await query('tipsee_nightly_cache', 'select=business_date');

  console.log('📦 Cache (tipsee_nightly_cache):');
  if (Array.isArray(cacheEarliest) && cacheEarliest.length > 0) {
    console.log(`  Earliest: ${cacheEarliest[0].business_date}`);
    console.log(`  Latest:   ${cacheLatest[0].business_date}`);
    console.log(`  Total entries: ${cacheTotal.length}`);

    // Count unique dates
    const uniqueDates = [...new Set(cacheTotal.map(c => c.business_date))];
    console.log(`  Unique dates: ${uniqueDates.length}`);
    console.log(`  Date range: ${uniqueDates.sort().join(', ')}`);
  } else {
    console.log('  ❌ No cache data');
  }

  // Check fact tables
  console.log('\n📊 Facts (venue_day_facts):');
  const factsEarliest = await query('venue_day_facts', 'select=business_date&order=business_date.asc&limit=1');
  const factsLatest = await query('venue_day_facts', 'select=business_date&order=business_date.desc&limit=1');
  const factsTotal = await query('venue_day_facts', 'select=business_date');

  if (Array.isArray(factsEarliest) && factsEarliest.length > 0) {
    console.log(`  Earliest: ${factsEarliest[0].business_date}`);
    console.log(`  Latest:   ${factsLatest[0].business_date}`);
    console.log(`  Total entries: ${factsTotal.length}`);

    const uniqueDates = [...new Set(factsTotal.map(f => f.business_date))];
    console.log(`  Unique dates: ${uniqueDates.length}`);
    console.log(`  Date range: ${uniqueDates.sort().slice(0, 10).join(', ')}${uniqueDates.length > 10 ? '...' : ''}`);
  } else {
    console.log('  ❌ No fact data');
  }

  // Check recent week
  console.log('\n📅 Recent Week Coverage:');
  const today = new Date();
  for (let i = 7; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const cacheCount = await query('tipsee_nightly_cache', `select=venue_id&business_date=eq.${dateStr}`);
    const factCount = await query('venue_day_facts', `select=venue_id&business_date=eq.${dateStr}`);

    const cacheVenues = Array.isArray(cacheCount) ? cacheCount.length : 0;
    const factVenues = Array.isArray(factCount) ? factCount.length : 0;

    const status = cacheVenues >= 7 ? '✅' : cacheVenues > 0 ? '⚠️' : '❌';
    console.log(`  ${status} ${dateStr}: ${cacheVenues}/8 cached, ${factVenues}/8 facts`);
  }
}

main().catch(console.error);
