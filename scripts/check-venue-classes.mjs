const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYzOTE3NCwiZXhwIjoyMDc4MjE1MTc0fQ.N4erm4GjP1AV8uDP2OVPBIdZnNtuofPmyLFdM2IVhXI';

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
