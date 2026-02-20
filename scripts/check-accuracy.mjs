/**
 * Standalone accuracy check - zero dependencies, raw fetch to Supabase REST API
 * Usage: node scripts/check-accuracy.mjs
 */

import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from './_config.mjs';
const SUPABASE_KEY = SUPABASE_SERVICE_KEY;

async function query(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
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
  switch (dow) {
    case 0: return 'sunday';
    case 5: return 'friday';
    case 6: return 'saturday';
    default: return 'weekday';
  }
}

async function run() {
  console.log('Fetching production data...\n');

  const [biasAdj, venues, holidays, holidayAdj, forecasts, actuals] = await Promise.all([
    query('forecast_bias_adjustments', 'select=venue_id,covers_offset,day_type_offsets&effective_to=is.null'),
    query('venues', 'select=id,name,venue_class'),
    query('holiday_calendar', 'select=holiday_date,holiday_code'),
    query('holiday_adjustments', 'select=holiday_code,venue_class,covers_offset'),
    query('demand_forecasts', 'select=id,venue_id,business_date,shift_type,covers_predicted,revenue_predicted&order=business_date.desc'),
    query('venue_day_facts', 'select=venue_id,business_date,net_sales,covers_count'),
  ]);

  // Build maps
  const biasMap = new Map();
  for (const adj of biasAdj) {
    biasMap.set(adj.venue_id, { flat: adj.covers_offset || 0, byDayType: adj.day_type_offsets || {} });
  }

  const venueNameMap = new Map();
  const venueClassMap = new Map();
  for (const v of venues) {
    venueNameMap.set(v.id, v.name);
    if (v.venue_class) venueClassMap.set(v.id, v.venue_class);
  }

  const holidayMap = new Map();
  for (const h of holidays) {
    holidayMap.set(h.holiday_date, h.holiday_code);
  }

  const holidayAdjMap = new Map();
  for (const ha of holidayAdj) {
    holidayAdjMap.set(`${ha.holiday_code}|${ha.venue_class}`, ha.covers_offset || 0);
  }

  // Actuals map
  const actualsMap = new Map();
  for (const a of actuals) {
    actualsMap.set(`${a.venue_id}|${a.business_date}`, { covers: a.covers_count || 0, revenue: a.net_sales || 0 });
  }

  // Calculate per-venue metrics
  const venueMetrics = new Map();
  let matched = 0, unmatched = 0;

  for (const f of forecasts) {
    const actual = actualsMap.get(`${f.venue_id}|${f.business_date}`);
    if (!actual || actual.covers === 0) { unmatched++; continue; }
    matched++;

    const biasData = biasMap.get(f.venue_id) || { flat: 0, byDayType: {} };
    const dayType = getDayType(f.business_date);
    const dayTypeOffset = biasData.byDayType[dayType] ?? biasData.flat;

    const holidayCode = holidayMap.get(f.business_date);
    const venueClass = venueClassMap.get(f.venue_id);
    let holidayOffset = 0;
    if (holidayCode && venueClass) {
      holidayOffset = holidayAdjMap.get(`${holidayCode}|${venueClass}`) || 0;
    }
    const totalBias = dayTypeOffset + holidayOffset;

    if (!venueMetrics.has(f.venue_id)) {
      venueMetrics.set(f.venue_id, {
        name: venueNameMap.get(f.venue_id) || 'Unknown',
        rawPctErrors: [], correctedPctErrors: [], rawErrors: [],
        dayTypeOffsets: biasData.byDayType, flat: biasData.flat,
      });
    }

    const m = venueMetrics.get(f.venue_id);
    const pred = f.covers_predicted || 0;
    const act = actual.covers;
    const rawErr = pred - act;
    const rawPct = act > 0 ? Math.abs(rawErr / act) * 100 : 0;
    const corrPct = act > 0 ? Math.abs((pred + totalBias - act) / act) * 100 : 0;

    m.rawPctErrors.push(rawPct);
    m.correctedPctErrors.push(corrPct);
    m.rawErrors.push(rawErr);
  }

  // Print results
  console.log('========================================');
  console.log('  FORECAST ACCURACY - PRODUCTION');
  console.log('========================================\n');
  console.log(`Forecasts: ${forecasts.length} | Matched: ${matched} | Unmatched: ${unmatched}\n`);

  const results = [];
  for (const [vid, m] of venueMetrics) {
    const n = m.rawPctErrors.length;
    if (n === 0) continue;
    const rawMape = m.rawPctErrors.reduce((a, b) => a + b, 0) / n;
    const corrMape = m.correctedPctErrors.reduce((a, b) => a + b, 0) / n;
    const avgBias = m.rawErrors.reduce((a, b) => a + b, 0) / n;
    const within10raw = (m.rawPctErrors.filter(e => e <= 10).length / n * 100);
    const within10corr = (m.correctedPctErrors.filter(e => e <= 10).length / n * 100);
    results.push({
      venue: m.name, days: n,
      raw_mape: rawMape.toFixed(1),
      corrected_mape: corrMape.toFixed(1),
      improvement: (rawMape - corrMape).toFixed(1),
      avg_bias: avgBias.toFixed(1),
      within10_raw: within10raw.toFixed(0) + '%',
      within10_corr: within10corr.toFixed(0) + '%',
    });
  }

  results.sort((a, b) => parseFloat(a.corrected_mape) - parseFloat(b.corrected_mape));

  console.log('Venue'.padEnd(20) + 'Days'.padStart(5) + 'Raw MAPE'.padStart(10) + 'Corrected'.padStart(11) + 'Improve'.padStart(9) + 'Bias'.padStart(8) + '  ±10% raw' + '  ±10% corr');
  console.log('-'.repeat(95));
  for (const r of results) {
    console.log(
      r.venue.padEnd(20) +
      String(r.days).padStart(5) +
      (r.raw_mape + '%').padStart(10) +
      (r.corrected_mape + '%').padStart(11) +
      (r.improvement + '%').padStart(9) +
      r.avg_bias.padStart(8) +
      r.within10_raw.padStart(10) +
      r.within10_corr.padStart(11)
    );
  }

  const totalDays = results.reduce((a, r) => a + r.days, 0);
  const wtdRawMape = results.reduce((a, r) => a + parseFloat(r.raw_mape) * r.days, 0) / totalDays;
  const wtdCorrMape = results.reduce((a, r) => a + parseFloat(r.corrected_mape) * r.days, 0) / totalDays;

  console.log('-'.repeat(95));
  console.log(
    'OVERALL (weighted)'.padEnd(20) +
    String(totalDays).padStart(5) +
    (wtdRawMape.toFixed(1) + '%').padStart(10) +
    (wtdCorrMape.toFixed(1) + '%').padStart(11) +
    ((wtdRawMape - wtdCorrMape).toFixed(1) + '%').padStart(9)
  );

  const getRating = (m) => m < 10 ? 'Excellent' : m < 15 ? 'Good' : m < 20 ? 'Moderate' : 'Poor';
  console.log(`\nRaw Rating: ${getRating(wtdRawMape)} | Corrected Rating: ${getRating(wtdCorrMape)}`);
  console.log(`MAPE Improvement: ${(wtdRawMape - wtdCorrMape).toFixed(1)} pp (${((wtdRawMape - wtdCorrMape) / wtdRawMape * 100).toFixed(0)}% relative)\n`);
}

run().catch(console.error);
