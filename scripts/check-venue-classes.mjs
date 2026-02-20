import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from './_config.mjs';
const SUPABASE_KEY = SUPABASE_SERVICE_KEY;

async function query(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function run() {
  const [venues, holidayAdj] = await Promise.all([
    query('venues', 'select=id,name,venue_class'),
    query('holiday_adjustments', 'select=holiday_code,venue_class,covers_offset,notes&order=venue_class,holiday_code'),
  ]);

  console.log('\nCurrent Venue Classes:');
  for (const v of venues) {
    console.log(`  ${v.name.padEnd(22)} → ${v.venue_class || '(none)'}`);
  }

  console.log('\nCurrent Holiday Adjustments:');
  let lastClass = '';
  for (const ha of holidayAdj) {
    if (ha.venue_class !== lastClass) { console.log(`\n  [${ha.venue_class}]`); lastClass = ha.venue_class; }
    console.log(`    ${ha.holiday_code.padEnd(16)} ${String(ha.covers_offset).padStart(4)}  ${ha.notes || ''}`);
  }
}

run().catch(console.error);
