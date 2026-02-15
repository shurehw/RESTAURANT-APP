/**
 * Check if Feb 8 data is populated in cache and fact tables
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
  console.log('=== Checking Feb 8, 2026 Data Status ===\n');

  // Check cache table
  const cache = await query('tipsee_nightly_cache', 'select=venue_id,business_date,created_at&business_date=eq.2026-02-08');
  console.log(`Cache entries for Feb 8: ${cache.length}`);
  if (cache.length > 0) {
    console.table(cache.map(c => ({
      venue: c.venue_id?.slice(0, 8),
      date: c.business_date,
      cached_at: new Date(c.created_at).toLocaleTimeString(),
    })));
  } else {
    console.log('  ❌ NO CACHE DATA for Feb 8\n');
  }

  // Check venue_day_facts
  const facts = await query('venue_day_facts', 'select=venue_id,business_date,net_sales,covers_count&business_date=eq.2026-02-08');
  console.log(`\nVenue day facts for Feb 8: ${facts.length}`);
  if (facts.length > 0) {
    console.table(facts.map(f => ({
      venue: f.venue_id?.slice(0, 8),
      sales: `$${(f.net_sales || 0).toLocaleString()}`,
      covers: f.covers_count || 0,
    })));
  } else {
    console.log('  ❌ NO FACT DATA for Feb 8\n');
  }

  // Check server_day_facts
  const servers = await query('server_day_facts', 'select=venue_id,business_date,server_name,net_sales&business_date=eq.2026-02-08&limit=3');
  console.log(`\nServer facts for Feb 8: ${servers.length} records (showing 3)`);
  if (servers.length > 0) {
    console.table(servers.map(s => ({
      venue: s.venue_id?.slice(0, 8),
      server: s.server_name,
      sales: `$${(s.net_sales || 0).toLocaleString()}`,
    })));
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Cache populated: ${cache.length > 0 ? '✅ YES' : '❌ NO'}`);
  console.log(`Facts populated: ${facts.length > 0 ? '✅ YES' : '❌ NO'}`);
  console.log(`Status: ${cache.length > 0 && facts.length > 0 ? '✅ READY' : '⚠️ INCOMPLETE'}`);
}

main().catch(console.error);
