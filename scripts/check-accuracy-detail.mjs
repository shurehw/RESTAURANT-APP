/**
 * Detailed per-venue, per-day-type accuracy breakdown
 * Shows exactly which offsets help and which hurt
 */
const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_KEY = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

async function query(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

function getDayType(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  const dow = date.getUTCDay();
  const holidays = [
    '2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-07-04',
    '2025-09-01','2025-11-27','2025-11-28','2025-12-25','2025-12-31',
    '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-07-04',
  ];
  if (holidays.includes(dateStr)) return 'holiday';
  switch (dow) { case 0: return 'sunday'; case 5: return 'friday'; case 6: return 'saturday'; default: return 'weekday'; }
}

async function run() {
  const [biasAdj, venues, holidays, holidayAdj, forecasts, actuals] = await Promise.all([
    query('forecast_bias_adjustments', 'select=venue_id,covers_offset,day_type_offsets&effective_to=is.null'),
    query('venues', 'select=id,name,venue_class'),
    query('holiday_calendar', 'select=holiday_date,holiday_code'),
    query('holiday_adjustments', 'select=holiday_code,venue_class,covers_offset'),
    query('demand_forecasts', 'select=venue_id,business_date,covers_predicted&order=business_date.desc'),
    query('venue_day_facts', 'select=venue_id,business_date,covers_count'),
  ]);

  const biasMap = new Map();
  for (const adj of biasAdj) biasMap.set(adj.venue_id, { flat: adj.covers_offset || 0, byDayType: adj.day_type_offsets || {} });

  const nameMap = new Map(), classMap = new Map();
  for (const v of venues) { nameMap.set(v.id, v.name); if (v.venue_class) classMap.set(v.id, v.venue_class); }

  const holidayMap = new Map();
  for (const h of holidays) holidayMap.set(h.holiday_date, h.holiday_code);

  const holidayAdjMap = new Map();
  for (const ha of holidayAdj) holidayAdjMap.set(`${ha.holiday_code}|${ha.venue_class}`, ha.covers_offset || 0);

  const actualsMap = new Map();
  for (const a of actuals) actualsMap.set(`${a.venue_id}|${a.business_date}`, a.covers_count || 0);

  // Per venue, per day_type breakdown
  // key: venueId|dayType -> { rawErrors, corrErrors, count, offset }
  const breakdown = new Map();

  for (const f of forecasts) {
    const act = actualsMap.get(`${f.venue_id}|${f.business_date}`);
    if (!act || act === 0) continue;

    const dayType = getDayType(f.business_date);
    const biasData = biasMap.get(f.venue_id) || { flat: 0, byDayType: {} };
    const dtOffset = biasData.byDayType[dayType] ?? biasData.flat;

    const hCode = holidayMap.get(f.business_date);
    const vClass = classMap.get(f.venue_id);
    let hOffset = 0;
    if (hCode && vClass) hOffset = holidayAdjMap.get(`${hCode}|${vClass}`) || 0;

    const totalOffset = dtOffset + hOffset;
    const key = `${f.venue_id}|${dayType}`;

    if (!breakdown.has(key)) {
      breakdown.set(key, { venue: nameMap.get(f.venue_id), dayType, offset: dtOffset, rawPctErrs: [], corrPctErrs: [], biases: [] });
    }
    const b = breakdown.get(key);
    const pred = f.covers_predicted || 0;
    b.rawPctErrs.push(Math.abs((pred - act) / act) * 100);
    b.corrPctErrs.push(Math.abs((pred + totalOffset - act) / act) * 100);
    b.biases.push(pred - act);
  }

  // Print per-venue breakdown
  const venueOrder = [...new Set([...breakdown.values()].map(b => b.venue))].sort();
  const dayTypes = ['weekday', 'friday', 'saturday', 'sunday', 'holiday'];

  for (const venueName of venueOrder) {
    console.log(`\n${'='.repeat(90)}`);
    console.log(`  ${venueName}`);
    console.log('='.repeat(90));
    console.log('Day Type'.padEnd(12) + 'Days'.padStart(5) + 'Offset'.padStart(8) + 'Raw MAPE'.padStart(10) + 'Corr MAPE'.padStart(11) + 'Delta'.padStart(8) + 'Avg Bias'.padStart(10) + '  Verdict');
    console.log('-'.repeat(90));

    for (const dt of dayTypes) {
      const entry = [...breakdown.values()].find(b => b.venue === venueName && b.dayType === dt);
      if (!entry || entry.rawPctErrs.length === 0) continue;

      const n = entry.rawPctErrs.length;
      const rawMape = entry.rawPctErrs.reduce((a, b) => a + b, 0) / n;
      const corrMape = entry.corrPctErrs.reduce((a, b) => a + b, 0) / n;
      const delta = rawMape - corrMape;
      const avgBias = entry.biases.reduce((a, b) => a + b, 0) / n;
      const verdict = delta > 1 ? 'HELPING' : delta < -1 ? 'HURTING' : 'neutral';

      console.log(
        dt.padEnd(12) +
        String(n).padStart(5) +
        String(entry.offset).padStart(8) +
        (rawMape.toFixed(1) + '%').padStart(10) +
        (corrMape.toFixed(1) + '%').padStart(11) +
        ((delta >= 0 ? '+' : '') + delta.toFixed(1)).padStart(8) +
        avgBias.toFixed(1).padStart(10) +
        '  ' + verdict
      );
    }
  }

  // Summary: which offsets to change
  console.log(`\n${'='.repeat(90)}`);
  console.log('  RECOMMENDATIONS - Offsets that are HURTING');
  console.log('='.repeat(90));
  for (const [key, entry] of breakdown) {
    const n = entry.rawPctErrs.length;
    if (n < 3) continue; // skip sparse data
    const rawMape = entry.rawPctErrs.reduce((a, b) => a + b, 0) / n;
    const corrMape = entry.corrPctErrs.reduce((a, b) => a + b, 0) / n;
    const delta = rawMape - corrMape;
    const avgBias = entry.biases.reduce((a, b) => a + b, 0) / n;
    if (delta < -1) {
      const recommendedOffset = Math.round(avgBias * -1); // opposite of bias
      console.log(`  ${entry.venue} / ${entry.dayType}: offset=${entry.offset} → HURTING by ${(-delta).toFixed(1)}pp | avg_bias=${avgBias.toFixed(1)} → recommended offset: ${recommendedOffset}`);
    }
  }
}

run().catch(console.error);
