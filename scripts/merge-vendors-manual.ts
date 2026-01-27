/**
 * Manual merge script for specific vendor duplicates
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Define specific merge groups: [keep_name, merge_names[]]
const MANUAL_MERGES: [string, string[]][] = [
  // Round 2 merges
  ["Spec's Liquors", ["8 Spec's Liquors"]],
  ['Johnson Brothers of Texas', ['Johnson Brothers Maverick of Texas']],
  ['Republic National Distributing Company', ['RNDC', 'RNDC (Republic National Distributing Company)']],
  ["Zab's Inc.", ["Zab's INC"]],
  ['Texas Roadhouse Steaks', ['Texas - the Great Steakhouse Steaks']],
];

async function getVendorByName(name: string) {
  const { data } = await supabase
    .from('vendors')
    .select('id, name, is_active')
    .ilike('name', name)
    .single();
  return data;
}

async function getVendorInvoiceCount(vendorId: string): Promise<number> {
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId);
  return count || 0;
}

async function mergeVendor(keepName: string, mergeName: string): Promise<boolean> {
  const keep = await getVendorByName(keepName);
  const merge = await getVendorByName(mergeName);

  if (!keep) {
    console.log(`  ⚠️  Keep vendor "${keepName}" not found`);
    return false;
  }
  if (!merge) {
    console.log(`  ⚠️  Merge vendor "${mergeName}" not found`);
    return false;
  }

  const keepCount = await getVendorInvoiceCount(keep.id);
  const mergeCount = await getVendorInvoiceCount(merge.id);

  console.log(`  Keeping: "${keep.name}" (${keepCount} invoices)`);
  console.log(`  Merging: "${merge.name}" (${mergeCount} invoices)`);

  // Reassign invoices (best effort)
  if (mergeCount > 0) {
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ vendor_id: keep.id })
      .eq('vendor_id', merge.id);

    if (updateError) {
      console.log(`    ⚠️  Failed to reassign invoices: ${updateError.message}`);
    } else {
      console.log(`    ✅ Reassigned ${mergeCount} invoices`);
    }
  }

  // Update vendor_item_aliases
  const { error: aliasError } = await supabase
    .from('vendor_item_aliases')
    .update({ vendor_id: keep.id })
    .eq('vendor_id', merge.id);

  if (aliasError && aliasError.code !== 'PGRST116') {
    console.log(`    ⚠️  Alias update: ${aliasError.message}`);
  }

  // Deactivate duplicate vendor
  const { error: deactivateError } = await supabase
    .from('vendors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', merge.id);

  if (deactivateError) {
    console.log(`    ❌ Failed to deactivate: ${deactivateError.message}`);
    return false;
  } else {
    console.log(`    ✅ Deactivated duplicate vendor`);
    return true;
  }
}

async function main() {
  console.log('🔄 Manual Vendor Merge\n');
  console.log('='.repeat(80));

  let totalMerged = 0;

  for (const [keepName, mergeNames] of MANUAL_MERGES) {
    console.log(`\nGroup: "${keepName}"`);
    console.log('─'.repeat(60));

    for (const mergeName of mergeNames) {
      const success = await mergeVendor(keepName, mergeName);
      if (success) totalMerged++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 MERGE COMPLETE\n');
  console.log(`  Vendors merged: ${totalMerged}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
