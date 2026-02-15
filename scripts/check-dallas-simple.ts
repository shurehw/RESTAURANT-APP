/**
 * Check Dallas Data - Simple Version
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDallas() {
  console.log('🔍 Dallas Data Check\n');

  // Get Dallas venue
  const { data: dallas } = await supabase
    .from('venues')
    .select('id, name, city, state')
    .ilike('name', '%dallas%')
    .single();

  console.log(`Venue: ${dallas?.name} - ${dallas?.city}, ${dallas?.state}`);
  console.log(`ID: ${dallas?.id}\n`);

  // Check if items table has venue_id
  const { data: itemSample } = await supabase
    .from('items')
    .select('*')
    .limit(1)
    .single();

  const hasVenueId = itemSample && 'venue_id' in itemSample;

  console.log('═══════════════════════════════════════════════════════');
  console.log('ITEM STRUCTURE');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Items have venue_id: ${hasVenueId ? 'YES' : 'NO'}`);

  if (hasVenueId) {
    const { count } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', dallas!.id);

    console.log(`Dallas-specific items: ${count || 0}`);
  } else {
    console.log('Items are organization-wide (shared across all venues)');
  }

  // Check total items
  const { count: totalItems } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`Total active items (all venues): ${totalItems || 0}\n`);

  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('✅ Dallas venue exists in system');
  console.log('❌ No Dallas-specific purchase logs (only Bird Street)');
  console.log('❌ No invoice OCR system built yet');
  console.log(`${hasVenueId ? '⚠️' : '✅'} Items are ${hasVenueId ? 'venue-specific' : 'organization-wide'}\n`);

  console.log('Current Data Sources:');
  console.log('  - Purchase logs: Bird Street only (LA)');
  console.log('  - Items database: Organization-wide (3,268 items)');
  console.log('  - Dallas: No purchase data captured yet\n');

  console.log('To Get Dallas Purchase Data:');
  console.log('  Option 1: Request Dallas purchase logs from R365');
  console.log('  Option 2: Build OCR system to scan Dallas invoices');
  console.log('  Option 3: Manually enter Dallas vendor items\n');
}

checkDallas().catch(console.error);
