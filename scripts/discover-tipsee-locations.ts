/**
 * Discover TipSee locations and map them to venues
 *
 * Usage:
 *   npx tsx scripts/discover-tipsee-locations.ts           # List all TipSee locations
 *   npx tsx scripts/discover-tipsee-locations.ts --map     # Interactive mapping
 */

import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// TipSee database config
const tipseePool = new Pool({
  host: process.env.TIPSEE_DB_HOST || 'TIPSEE_HOST_REDACTED',
  user: process.env.TIPSEE_DB_USER,
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

// Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TipseeLocation {
  name: string;
  uuid: string;
  first_date: string;
  last_date: string;
  total_checks: number;
}

async function getTipseeLocations(): Promise<TipseeLocation[]> {
  const result = await tipseePool.query(`
    SELECT
      location as name,
      location_uuid as uuid,
      MIN(trading_day)::date as first_date,
      MAX(trading_day)::date as last_date,
      COUNT(*)::int as total_checks
    FROM public.tipsee_checks
    WHERE location_uuid IS NOT NULL AND location IS NOT NULL
    GROUP BY location, location_uuid
    ORDER BY location
  `);
  return result.rows;
}

async function getVenues() {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, organization_id')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data || [];
}

async function getExistingMappings() {
  const { data, error } = await supabase
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid, tipsee_location_name');

  if (error) throw error;
  return data || [];
}

async function createMapping(venueId: string, tipseeUuid: string, tipseeName: string) {
  const { error } = await supabase
    .from('venue_tipsee_mapping')
    .upsert({
      venue_id: venueId,
      tipsee_location_uuid: tipseeUuid,
      tipsee_location_name: tipseeName,
      is_active: true,
    }, {
      onConflict: 'venue_id'
    });

  if (error) throw error;
}

async function main() {
  const isMapMode = process.argv.includes('--map');

  console.log('\n=== TipSee Location Discovery ===\n');

  // Get TipSee locations
  console.log('Fetching TipSee locations...');
  const tipseeLocations = await getTipseeLocations();

  console.log(`\nFound ${tipseeLocations.length} TipSee locations:\n`);
  console.log('─'.repeat(100));
  console.log(
    'Name'.padEnd(30) +
    'UUID'.padEnd(40) +
    'Date Range'.padEnd(25) +
    'Checks'
  );
  console.log('─'.repeat(100));

  for (const loc of tipseeLocations) {
    console.log(
      loc.name.padEnd(30) +
      loc.uuid.padEnd(40) +
      `${loc.first_date} to ${loc.last_date}`.padEnd(25) +
      loc.total_checks.toLocaleString()
    );
  }
  console.log('─'.repeat(100));

  // Get existing mappings
  const mappings = await getExistingMappings();
  const mappedUuids = new Set(mappings.map(m => m.tipsee_location_uuid));

  console.log(`\nExisting mappings: ${mappings.length}`);
  for (const m of mappings) {
    console.log(`  ✓ ${m.tipsee_location_name} → venue ${m.venue_id}`);
  }

  // Show unmapped locations
  const unmapped = tipseeLocations.filter(loc => !mappedUuids.has(loc.uuid));
  if (unmapped.length > 0) {
    console.log(`\nUnmapped TipSee locations: ${unmapped.length}`);
    for (const loc of unmapped) {
      console.log(`  ✗ ${loc.name} (${loc.uuid})`);
    }
  }

  if (!isMapMode) {
    console.log('\nRun with --map to interactively create mappings');
    await tipseePool.end();
    return;
  }

  // Interactive mapping mode
  console.log('\n=== Interactive Mapping Mode ===\n');

  const venues = await getVenues();
  console.log(`Available venues (${venues.length}):`);
  venues.forEach((v, i) => console.log(`  [${i + 1}] ${v.name} (${v.id})`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, resolve));

  for (const loc of unmapped) {
    console.log(`\n─── ${loc.name} ───`);
    console.log(`UUID: ${loc.uuid}`);
    console.log(`Data: ${loc.first_date} to ${loc.last_date} (${loc.total_checks.toLocaleString()} checks)`);

    const answer = await question('\nMap to venue # (or "s" to skip, "q" to quit): ');

    if (answer.toLowerCase() === 'q') break;
    if (answer.toLowerCase() === 's') continue;

    const venueIndex = parseInt(answer) - 1;
    if (venueIndex >= 0 && venueIndex < venues.length) {
      const venue = venues[venueIndex];
      await createMapping(venue.id, loc.uuid, loc.name);
      console.log(`✓ Mapped "${loc.name}" → "${venue.name}"`);
    } else {
      console.log('Invalid selection, skipping');
    }
  }

  rl.close();
  await tipseePool.end();
  console.log('\nDone!');
}

main().catch(console.error);
