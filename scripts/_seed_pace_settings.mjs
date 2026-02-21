import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// All 11 active venues (correct IDs from venues table)
const venues = [
  { id: 'a7da18a4-a70b-4492-abed-c9fed5851c9e', name: 'Bird Streets Club',       start: 17, end: 2 },
  { id: '288b7f22-ffdc-4701-a396-a6b415aff0f1', name: 'Delilah Miami',           start: 18, end: 3 },
  { id: 'c6776476-44c5-454b-9765-29f3737e3776', name: 'Didi Events',             start: 18, end: 2 },
  { id: 'f9fb757b-e2dc-4c16-835d-9de80f983073', name: 'Keys',                    start: 18, end: 3 },
  { id: 'a2f9d28d-8dde-4b57-8013-2c94602fe078', name: 'Poppy',                   start: 22, end: 3 },
  { id: '79c33e6a-eb21-419f-9606-7494d1a9584c', name: 'Delilah Dallas',           start: 17, end: 2 },
  { id: '11111111-1111-1111-1111-111111111111', name: 'Delilah LA',               start: 18, end: 3 },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Nice Guy LA',              start: 18, end: 3 },
  { id: '98be7b04-918e-4e08-8d7a-fce8fe854d3c', name: 'Harriets West Hollywood',  start: 17, end: 2 },
  { id: '92181a91-f1a6-449e-8afd-fc680d247837', name: 'Harriets Nashville',       start: 17, end: 2 },
  { id: '3428bb42-180e-4fb4-917f-0d62bb5a1a44', name: 'Delilah Las Vegas',        start: 18, end: 3 },
];

console.log('Seeding sales_pace_settings for all 11 venues...\n');

for (const v of venues) {
  const { error } = await sb.from('sales_pace_settings').upsert({
    venue_id: v.id,
    polling_interval_seconds: 300,
    service_start_hour: v.start,
    service_end_hour: v.end,
    use_forecast: true,
    use_sdlw: true,
    pace_warning_pct: 15,
    pace_critical_pct: 25,
    is_active: true,
  }, { onConflict: 'venue_id' });

  if (error) {
    console.log(`  ${v.name}: ERROR - ${error.message}`);
  } else {
    console.log(`  ${v.name}: ✅ poll every 5min | service ${v.start}:00 - ${v.end}:00`);
  }
}

// Verify
const { data } = await sb.from('sales_pace_settings').select('venue_id, is_active, polling_interval_seconds').eq('is_active', true);
console.log(`\n✅ ${data?.length} venues now have polling enabled`);
