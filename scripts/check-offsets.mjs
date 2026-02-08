/**
 * Quick check of current bias offsets + per-venue day-type breakdown
 */
const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_KEY = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

async function query(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function run() {
  const [biasAdj, venues] = await Promise.all([
    query('forecast_bias_adjustments', 'select=venue_id,covers_offset,day_type_offsets&effective_to=is.null'),
    query('venues', 'select=id,name'),
  ]);

  const nameMap = new Map(venues.map(v => [v.id, v.name]));

  console.log('\nCurrent Bias Offsets:\n');
  for (const adj of biasAdj) {
    console.log(`${(nameMap.get(adj.venue_id) || adj.venue_id).padEnd(22)} flat: ${String(adj.covers_offset).padStart(4)}  day_type: ${JSON.stringify(adj.day_type_offsets)}`);
  }
}

run().catch(console.error);
