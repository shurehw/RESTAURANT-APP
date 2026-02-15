/**
 * List all venue mappings with their slugs
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
  const mappings = await query('venue_tipsee_mapping', 'select=venue_id,tipsee_location_name,tipsee_location_uuid&is_active=eq.true');

  console.log('=== Active Venues ===\n');
  for (const m of mappings) {
    const slug = (m.tipsee_location_name || 'unknown').toLowerCase().replace(/\s+/g, '-');
    console.log(`Name: ${m.tipsee_location_name}`);
    console.log(`Slug: ${slug}`);
    console.log(`UUID: ${m.tipsee_location_uuid}`);
    console.log(`Venue ID: ${m.venue_id?.substring(0, 8)}...`);
    console.log('');
  }
}

main().catch(console.error);
