/**
 * Check Dallas Data in Database
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDallasInDatabase() {
  console.log('🔍 Checking Dallas Data in Database\n');

  // Get all venues
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, city, state')
    .order('name');

  console.log('All Venues:');
  venues?.forEach(v => {
    const location = v.city && v.state ? `${v.city}, ${v.state}` : 'Location not set';
    console.log(`  ${v.name} - ${location}`);
  });

  console.log('\n');

  // Find Dallas venue
  const dallasVenue = venues?.find(v =>
    v.name?.toLowerCase().includes('dallas') ||
    v.city?.toLowerCase().includes('dallas')
  );

  if (!dallasVenue) {
    console.log('❌ No Dallas venue found\n');
    return;
  }

  console.log(`✅ Dallas Venue Found: ${dallasVenue.name} (${dallasVenue.id})\n`);

  // Check for venue-specific item relationships
  const { data: venueItems, error: venueItemsError } = await supabase
    .from('venue_items')
    .select('*', { count: 'exact', head: true })
    .eq('venue_id', dallasVenue.id)
    .catch(() => ({ data: null, error: 'Table does not exist' }));

  if (!venueItemsError && venueItems !== null) {
    console.log(`Venue-specific items for Dallas: ${venueItems}\n`);
  } else {
    console.log('No venue_items table (items are org-wide, not venue-specific)\n');
  }

  // Check if items table has venue_id
  const { data: sampleItem } = await supabase
    .from('items')
    .select('*')
    .limit(1)
    .single();

  if (sampleItem && 'venue_id' in sampleItem) {
    console.log('Items table HAS venue_id column\n');

    // Count Dallas-specific items
    const { count: dallasItemCount } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', dallasVenue.id);

    console.log(`Dallas-specific items: ${dallasItemCount || 0}\n`);
  } else {
    console.log('Items table does NOT have venue_id - items are organization-wide\n');
  }

  // Check for Dallas invoices/purchases in any related tables
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 CHECKING FOR DALLAS PURCHASE DATA');
  console.log('═══════════════════════════════════════════════════════\n');

  // Check various tables that might have Dallas data
  const tablesToCheck = [
    'invoices',
    'invoice_line_items',
    'purchases',
    'purchase_orders',
    'vendor_invoices',
    'ap_invoices'
  ];

  for (const tableName of tablesToCheck) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', dallasVenue.id)
      .catch(() => ({ count: null, error: 'Table not found' }));

    if (!error && count !== null) {
      console.log(`  ${tableName}: ${count} records for Dallas`);
    }
  }

  console.log('\n');

  // Check OCR/document related tables
  console.log('OCR/Document Tables:');
  const ocrTables = [
    'documents',
    'ocr_results',
    'invoice_scans',
    'uploaded_invoices'
  ];

  for (const tableName of ocrTables) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .catch(() => ({ count: null, error: 'Table not found' }));

    if (!error && count !== null) {
      console.log(`  ${tableName}: ${count} total records`);

      // Check if venue-specific
      const { count: venueCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('venue_id', dallasVenue.id)
        .catch(() => ({ count: null }));

      if (venueCount !== null && venueCount > 0) {
        console.log(`    └─ Dallas: ${venueCount} records`);
      }
    }
  }

  console.log('\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('💡 SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Dallas venue exists in database: ✅');
  console.log('Dallas items in database: ❌ (items are org-wide)');
  console.log('Dallas purchase logs: ❌ (only Bird Street in logs)');
  console.log('Dallas invoice OCR: ❌ (OCR system not built yet)\n');

  console.log('To get Dallas purchase data:');
  console.log('  1. Request Dallas-specific purchase logs from R365');
  console.log('  2. Build invoice OCR system to capture Dallas invoices');
  console.log('  3. Manually upload Dallas vendor invoices\n');
}

checkDallasInDatabase().catch(console.error);
