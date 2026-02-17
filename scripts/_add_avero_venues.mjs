import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORG_ID = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

const NEW_VENUES = [
  {
    name: 'Harriets West Hollywood',
    tipsee_uuid: 'f87a6465-ce07-49c5-a58a-8961ef8069a5',
  },
  {
    name: 'Harriets Nashville',
    tipsee_uuid: '64d4b528-4a05-4c82-b035-afd914cd44d5',
  },
  {
    name: 'Delilah Las Vegas',
    tipsee_uuid: 'a096774a-7349-47b7-a577-af4758827243',
  },
];

for (const v of NEW_VENUES) {
  // 1. Create venue
  const { data: venue, error: venueErr } = await svc
    .from('venues')
    .insert({
      name: v.name,
      organization_id: ORG_ID,
      is_active: true,
      pos_type: 'toast', // Avero venues — no live POS feed, historical data only via TipSee
    })
    .select()
    .single();

  if (venueErr) {
    console.error(`Error creating venue ${v.name}:`, venueErr.message);
    continue;
  }
  console.log(`Created venue: ${v.name} (${venue.id})`);

  // 2. Create TipSee mapping
  const { error: mapErr } = await svc
    .from('venue_tipsee_mapping')
    .insert({
      venue_id: venue.id,
      tipsee_location_uuid: v.tipsee_uuid,
      is_active: true,
    });

  if (mapErr) {
    console.error(`Error creating mapping for ${v.name}:`, mapErr.message);
  } else {
    console.log(`  Mapped to TipSee: ${v.tipsee_uuid}`);
  }
}

// Verify
const { data: allVenues } = await svc
  .from('venues')
  .select('id, name, is_active')
  .eq('organization_id', ORG_ID)
  .order('name');
console.log('\nAll venues:');
console.table(allVenues);

const { data: allMappings } = await svc
  .from('venue_tipsee_mapping')
  .select('venue_id, tipsee_location_uuid, is_active, venues!inner(name)')
  .order('venues(name)');
console.log('\nAll mappings:');
console.table(allMappings?.map(m => ({
  venue: m.venues?.name,
  uuid: m.tipsee_location_uuid,
  active: m.is_active,
})));
