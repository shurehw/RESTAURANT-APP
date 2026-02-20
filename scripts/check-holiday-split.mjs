import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from './_config.mjs';
const SUPABASE_KEY = SUPABASE_SERVICE_KEY;

async function query(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function run() {
  const [venues, holidays, forecasts, actuals] = await Promise.all([
    query('venues', 'select=id,name,venue_class'),
    query('holiday_calendar', 'select=holiday_date,holiday_code'),
    query('demand_forecasts', 'select=venue_id,business_date,covers_predicted'),
    query('venue_day_facts', 'select=venue_id,business_date,covers_count'),
  ]);

  const nameMap = new Map(venues.map(v => [v.id, v.name]));
  const holidayMap = new Map(holidays.map(h => [h.holiday_date, h.holiday_code]));
  const actualsMap = new Map(actuals.map(a => [`${a.venue_id}|${a.business_date}`, a.covers_count || 0]));

  // Filter to high_end_social venues only (Nice Guy, Delilah LA, Delilah Miami)
  const targetVenues = venues.filter(v => v.venue_class === 'high_end_social');

  console.log('\nHoliday Performance - Nice Guy vs Delilah\n');
  console.log('Venue'.padEnd(20) + 'Holiday'.padEnd(16) + 'Date'.padEnd(14) + 'Predicted'.padStart(10) + 'Actual'.padStart(8) + 'Error'.padStart(8) + 'Bias'.padStart(8));
  console.log('-'.repeat(84));

  for (const venue of targetVenues) {
    const vForecasts = forecasts.filter(f => f.venue_id === venue.id);
    for (const f of vForecasts) {
      const hCode = holidayMap.get(f.business_date);
      if (!hCode) continue;

      const act = actualsMap.get(`${f.venue_id}|${f.business_date}`);
      if (!act) continue;

      const pred = f.covers_predicted || 0;
      const bias = pred - act;
      const pctErr = act > 0 ? Math.abs(bias / act * 100).toFixed(0) + '%' : 'N/A';

      console.log(
        venue.name.padEnd(20) +
        hCode.padEnd(16) +
        f.business_date.padEnd(14) +
        String(pred).padStart(10) +
        String(act).padStart(8) +
        (pctErr).padStart(8) +
        String(bias).padStart(8)
      );
    }
  }

  // Summary: avg bias per venue on holidays
  console.log('\n\nSummary - Avg Holiday Bias by Venue:\n');
  for (const venue of targetVenues) {
    const biases = [];
    const vForecasts = forecasts.filter(f => f.venue_id === venue.id);
    for (const f of vForecasts) {
      if (!holidayMap.has(f.business_date)) continue;
      const act = actualsMap.get(`${f.venue_id}|${f.business_date}`);
      if (!act) continue;
      biases.push((f.covers_predicted || 0) - act);
    }
    if (biases.length > 0) {
      const avg = biases.reduce((a, b) => a + b, 0) / biases.length;
      console.log(`  ${venue.name.padEnd(22)} n=${biases.length}  avg_bias=${avg.toFixed(1)} (${avg < 0 ? 'under-predicting' : 'over-predicting'})`);
    }
  }
}

run().catch(console.error);
