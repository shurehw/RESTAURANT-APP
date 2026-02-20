#!/usr/bin/env node
/**
 * Direct Backfill Script
 *
 * Uses only built-in Node.js fetch - NO npm packages required.
 * Queries TipSee directly and upserts to Supabase via REST API.
 *
 * Run with: node scripts/direct-backfill.mjs
 */

import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from './_config.mjs';

// TipSee connection via Supabase Edge Function
// We'll call the existing edge function for each date

const headers = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function supabaseRest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  return res.json();
}

async function getVenueMappings() {
  const data = await supabaseRest('venue_tipsee_mapping?is_active=eq.true&select=venue_id,tipsee_location_uuid,venues(name)');
  return data.map(row => ({
    venue_id: row.venue_id,
    tipsee_location_uuid: row.tipsee_location_uuid,
    venue_name: row.venues?.name || 'Unknown',
  }));
}

async function syncVenueDay(venueId, businessDate) {
  // Call the ETL sync edge function
  const url = `${SUPABASE_URL}/functions/v1/etl-sync?date=${businessDate}&venue_id=${venueId}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `${res.status}: ${text}` };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function backfill(startDate, endDate) {
  console.log('='.repeat(60));
  console.log('Direct Backfill (via Edge Function)');
  console.log('='.repeat(60));
  console.log(`Date Range: ${startDate} → ${endDate}`);

  const mappings = await getVenueMappings();
  if (mappings.length === 0) {
    console.error('No venue mappings found!');
    process.exit(1);
  }

  console.log(`Venues: ${mappings.map(v => v.venue_name).join(', ')}`);

  // Calculate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  const totalSyncs = totalDays * mappings.length;

  console.log(`Total days: ${totalDays}`);
  console.log(`Total syncs: ${totalSyncs}`);
  console.log('='.repeat(60));
  console.log('');

  let successful = 0;
  let failed = 0;
  let currentSync = 0;

  const overallStart = Date.now();

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    for (const mapping of mappings) {
      currentSync++;
      const result = await syncVenueDay(mapping.venue_id, dateStr);

      if (result.success) {
        successful++;
        const pct = ((currentSync / totalSyncs) * 100).toFixed(1);
        process.stdout.write(`\r[${pct}%] ${mapping.venue_name} ${dateStr}                    `);
      } else {
        failed++;
        console.log(`\n✗ ${mapping.venue_name} ${dateStr}: ${result.error}`);
      }
    }
  }

  const duration = ((Date.now() - overallStart) / 1000).toFixed(1);

  console.log('\n');
  console.log('='.repeat(60));
  console.log('Backfill Complete');
  console.log('='.repeat(60));
  console.log(`Total syncs: ${successful + failed}`);
  console.log(`Successful:  ${successful}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Duration:    ${duration}s`);

  process.exit(failed > 0 ? 1 : 0);
}

// Parse args
const args = process.argv.slice(2);
let startDate = '2025-12-29';
let endDate = new Date();
endDate.setDate(endDate.getDate() - 1);
endDate = endDate.toISOString().split('T')[0];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start') startDate = args[++i];
  if (args[i] === '--end') endDate = args[++i];
}

backfill(startDate, endDate);
