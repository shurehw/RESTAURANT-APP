/**
 * Assign venues to H.Wood organization
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function assignVenuesToHWood() {
  console.log('\n🔧 Assigning venues to H.Wood organization...\n');

  // Find H.Wood organization
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%');

  if (orgError) {
    console.error('Error finding organization:', orgError);
    return;
  }

  if (!orgs || orgs.length === 0) {
    console.error('H.Wood organization not found. Please create it first.');
    return;
  }

  const hwoodOrg = orgs[0];
  console.log(`Found organization: ${hwoodOrg.name} (${hwoodOrg.id})\n`);

  // Get all venues
  const { data: venues, error: venuesError } = await supabase
    .from('venues')
    .select('id, name, organization_id');

  if (venuesError) {
    console.error('Error fetching venues:', venuesError);
    return;
  }

  if (!venues || venues.length === 0) {
    console.log('No venues found.');
    return;
  }

  console.log(`Found ${venues.length} venue(s):\n`);
  venues.forEach(v => console.log(`  - ${v.name} (${v.id})`));

  // Update all venues to H.Wood organization
  for (const venue of venues) {
    console.log(`\nUpdating ${venue.name}...`);

    const { error: updateError } = await supabase
      .from('venues')
      .update({ organization_id: hwoodOrg.id })
      .eq('id', venue.id);

    if (updateError) {
      console.error(`  ❌ Error: ${updateError.message}`);
    } else {
      console.log(`  ✅ Success`);
    }
  }

  console.log('\n✅ All venues updated!\n');
}

assignVenuesToHWood().catch(console.error);
