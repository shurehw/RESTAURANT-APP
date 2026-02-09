/**
 * Check forecast_accuracy_stats table and diagnose why it might be empty
 * Usage: node scripts/check-accuracy-stats.mjs
 */

const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

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

async function rpc(fnName, args = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return res.json();
}

async function main() {
  console.log('=== Forecast Accuracy Stats Diagnostic ===\n');

  // 1. Check what's in forecast_accuracy_stats
  const stats = await query('forecast_accuracy_stats', 'select=*');
  console.log(`1. forecast_accuracy_stats rows: ${stats.length}`);
  if (stats.length > 0) {
    console.table(stats.map(s => ({
      venue_id: s.venue_id?.slice(0, 8),
      day_type: s.day_type,
      mape: s.mape,
      within_10pct: s.within_10pct,
      sample_size: s.sample_size,
    })));
  } else {
    console.log('   TABLE IS EMPTY - function did not insert any rows\n');
  }

  // 2. Check if demand_forecasts has historical data
  const forecasts = await query('demand_forecasts', 'select=id&limit=1');
  console.log(`2. demand_forecasts has data: ${forecasts.length > 0 ? 'YES' : 'NO'}`);

  // 3. Check if venue_day_facts has covers_count > 0
  const vdf = await query('venue_day_facts', 'select=venue_id,business_date,covers_count&covers_count=gt.0&order=business_date.desc&limit=5');
  console.log(`3. venue_day_facts with covers > 0 (latest 5):`);
  if (vdf.length > 0) {
    console.table(vdf.map(v => ({
      venue_id: v.venue_id?.slice(0, 8),
      date: v.business_date,
      covers: v.covers_count,
    })));
  } else {
    console.log('   NO venue_day_facts with covers > 0');
  }

  // 4. Check demand_forecasts date range
  const dfDates = await query('demand_forecasts', 'select=business_date&order=business_date.desc&limit=5');
  console.log(`4. demand_forecasts latest dates:`);
  if (dfDates.length > 0) {
    dfDates.forEach(d => console.log(`   ${d.business_date}`));
  }

  const dfOldDates = await query('demand_forecasts', 'select=business_date&order=business_date.asc&limit=5');
  console.log(`   demand_forecasts earliest dates:`);
  if (dfOldDates.length > 0) {
    dfOldDates.forEach(d => console.log(`   ${d.business_date}`));
  }

  // 5. Check venue_day_facts date range
  const vdfDates = await query('venue_day_facts', 'select=business_date&covers_count=gt.0&order=business_date.desc&limit=5');
  console.log(`5. venue_day_facts latest dates (with covers):`);
  if (vdfDates.length > 0) {
    vdfDates.forEach(d => console.log(`   ${d.business_date}`));
  }

  // 6. Check overlapping dates between demand_forecasts and venue_day_facts
  // Get unique venue_ids from demand_forecasts
  const dfVenues = await query('demand_forecasts', 'select=venue_id&limit=100');
  const uniqueVenues = [...new Set(dfVenues.map(f => f.venue_id))];
  console.log(`\n6. Venues with forecasts: ${uniqueVenues.length}`);

  for (const vid of uniqueVenues) {
    const short = vid.slice(0, 8);
    // Check if this venue has both forecasts AND day_facts in overlapping date range
    const fCount = await query('demand_forecasts', `select=id&venue_id=eq.${vid}&business_date=lt.2026-02-06&limit=1`);
    const vCount = await query('venue_day_facts', `select=venue_id&venue_id=eq.${vid}&covers_count=gt.0&limit=1`);
    console.log(`   ${short}: forecasts_past=${fCount.length > 0 ? 'YES' : 'NO'}, day_facts=${vCount.length > 0 ? 'YES' : 'NO'}`);
  }

  // 7. Try running the function manually
  console.log('\n7. Attempting to run refresh_forecast_accuracy_stats(90)...');
  const result = await rpc('refresh_forecast_accuracy_stats', { p_lookback_days: 90 });
  console.log(`   Result:`, JSON.stringify(result, null, 2));

  // 8. Re-check stats after refresh
  const statsAfter = await query('forecast_accuracy_stats', 'select=*');
  console.log(`\n8. forecast_accuracy_stats rows after refresh: ${statsAfter.length}`);
  if (statsAfter.length > 0) {
    console.table(statsAfter.map(s => ({
      venue_id: s.venue_id?.slice(0, 8),
      day_type: s.day_type,
      mape: s.mape,
      within_10pct: s.within_10pct,
      sample_size: s.sample_size,
    })));
  }
}

main().catch(console.error);
