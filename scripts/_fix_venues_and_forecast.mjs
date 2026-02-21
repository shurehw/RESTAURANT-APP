/**
 * 1. Fix missing venue coordinates, timezones, venue_class
 * 2. Fix missing location_config
 * 3. Run Prophet forecaster for all venues
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── 1. Fix missing venue coordinates & classes ──
console.log('═══ FIXING VENUE METADATA ═══\n');

const fixes = [
  {
    name: 'Delilah Las Vegas',
    id: '3428bb42-180e-4fb4-917f-0d62bb5a1a44',
    latitude: 36.1162,
    longitude: -115.1745,
    timezone: 'America/Los_Angeles', // Vegas is Pacific
    venue_class: 'supper_club',
  },
  {
    name: 'Harriets Nashville',
    id: '92181a91-f1a6-449e-8afd-fc680d247837',
    latitude: 36.1527,
    longitude: -86.7816,
    timezone: 'America/Chicago',
    venue_class: 'supper_club',
  },
  {
    name: 'Harriets West Hollywood',
    id: '98be7b04-918e-4e08-8d7a-fce8fe854d3c',
    latitude: 34.0900,
    longitude: -118.3617,
    timezone: 'America/Los_Angeles',
    venue_class: 'supper_club',
  },
];

for (const fix of fixes) {
  const { error } = await sb.from('venues').update({
    latitude: fix.latitude,
    longitude: fix.longitude,
    timezone: fix.timezone,
    venue_class: fix.venue_class,
  }).eq('id', fix.id);

  console.log(`  ${fix.name}: ${error ? `❌ ${error.message}` : '✅ coords + class set'}`);
}

// ── 2. Fix missing location_config ──
console.log('\n═══ FIXING LOCATION CONFIG ═══\n');

const configs = [
  { venue_id: '3428bb42-180e-4fb4-917f-0d62bb5a1a44', name: 'Delilah Las Vegas', closed_weekdays: [0] },       // Sun closed
  { venue_id: 'c6776476-44c5-454b-9765-29f3737e3776', name: 'Didi Events', closed_weekdays: [] },               // Events venue, varies
  { venue_id: '92181a91-f1a6-449e-8afd-fc680d247837', name: 'Harriets Nashville', closed_weekdays: [0] },       // Sun closed
  { venue_id: '98be7b04-918e-4e08-8d7a-fce8fe854d3c', name: 'Harriets West Hollywood', closed_weekdays: [0] },  // Sun closed
];

for (const cfg of configs) {
  const { error } = await sb.from('location_config').upsert({
    venue_id: cfg.venue_id,
    closed_weekdays: cfg.closed_weekdays,
  }, { onConflict: 'venue_id' });

  console.log(`  ${cfg.name}: ${error ? `❌ ${error.message}` : `✅ closed=${JSON.stringify(cfg.closed_weekdays)}`}`);
}

// ── 3. Verify all venues now have coords ──
console.log('\n═══ VERIFICATION ═══\n');
const { data: venues } = await sb.from('venues').select('id, name, latitude, longitude, timezone, venue_class').order('name');
for (const v of venues) {
  const ok = v.latitude && v.longitude && v.timezone && v.venue_class;
  console.log(`  ${v.name.padEnd(25)} ${ok ? '✅' : '❌'} lat=${v.latitude} lon=${v.longitude} tz=${v.timezone} class=${v.venue_class}`);
}

console.log('\n✓ All venue metadata fixed. Ready for Prophet.');
