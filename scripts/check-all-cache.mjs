/**
 * Check what dates have cache data
 */

const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_KEY = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

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
  console.log('=== Cache Data Status ===\n');

  // Get all cache entries, grouped by date
  const cache = await query('tipsee_nightly_cache', 'select=business_date,venue_id&order=business_date.desc');

  if (!Array.isArray(cache) || cache.length === 0) {
    console.log('❌ NO CACHE DATA AT ALL!\n');
    console.log('Cache table response:', cache);
    return;
  }

  // Group by date
  const byDate = {};
  for (const entry of cache) {
    const date = entry.business_date;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(entry);
  }

  console.log(`Total cache entries: ${cache.length}`);
  console.log(`Dates with cache: ${Object.keys(byDate).length}\n`);

  console.log('Date breakdown:');
  for (const [date, entries] of Object.entries(byDate)) {
    console.log(`  ${date}: ${entries.length} venues cached`);
  }

  // Check specific recent dates
  console.log('\n=== Recent Dates (Feb 6-9) ===');
  for (const date of ['2026-02-06', '2026-02-07', '2026-02-08', '2026-02-09']) {
    const count = byDate[date]?.length || 0;
    console.log(`  ${date}: ${count > 0 ? '✅' : '❌'} ${count} venues`);
  }

  // Check fact tables too
  console.log('\n=== Fact Tables Status ===');
  const facts = await query('venue_day_facts', 'select=business_date&order=business_date.desc&limit=10');
  console.log('Latest venue_day_facts dates:');
  if (Array.isArray(facts)) {
    const uniqueDates = [...new Set(facts.map(f => f.business_date))];
    uniqueDates.forEach(d => console.log(`  ${d}`));
  }
}

main().catch(console.error);
