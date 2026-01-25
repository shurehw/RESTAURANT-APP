import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Converts a vendor name to title case with proper handling of special cases
 */
function toProperCase(name: string): string {
  // Words that should stay lowercase
  const lowercase = ['and', 'or', 'the', 'of', 'at', 'by', 'for', 'in', 'on', 'to', 'with'];

  // Words that should stay uppercase
  const uppercase = ['llc', 'inc', 'dba', 'usa', 'dfa', 'rndc', 'na', 'co', 'ltd', 'tx', 'mep', 'mfw'];

  // Acronyms and special cases (full name matches)
  const special: { [key: string]: string } = {
    'sysco': 'Sysco',
    'sysco north texas': 'Sysco North Texas',
    'ben e keith': 'Ben E Keith',
    'oak farms-dallas dfa dairy brands': 'Oak Farms-Dallas DFA Dairy Brands',
    'chefs warehouse': "Chef's Warehouse",
    'the chefs warehouse': "The Chef's Warehouse",
    'the chefswarehouse (midwest llc)': "The Chef's Warehouse (Midwest LLC)",
    'republic national distributing company': 'Republic National Distributing Company',
    'dfa dairy brands': 'DFA Dairy Brands',
    'specs': "Spec's",
    'mt greens': 'Mt. Greens',
    'marion': 'Marion',
    'marconi': 'Marconi',
    'marbool': 'Marbool',
    'markon': 'Markon',
    'dalton plumbing': 'Dalton Plumbing',
    'farm to table': 'Farm to Table',
    'rare foods': 'Rare Foods',
    'regalis tx': 'Regalis TX',
    'rocker bros. meat & provision, inc.': 'Rocker Bros. Meat & Provision, Inc.',
    'seafood supply company': 'Seafood Supply Company',
    "southern glazer's of tx": "Southern Glazer's of TX",
    "zab's inc": "Zab's Inc.",
    'mep florida llc': 'MEP Florida LLC',
    'mfw - maekor fine wine': 'MFW - Maekor Fine Wine',
  };

  const normalized = name.toLowerCase().trim();

  // Check for exact special case matches first
  if (special[normalized]) {
    return special[normalized];
  }

  // Check for partial matches in longer names
  for (const [key, value] of Object.entries(special)) {
    if (normalized.includes(key)) {
      return name.replace(new RegExp(key, 'gi'), value);
    }
  }

  // Apply title case with special handling
  return name
    .split(/(\s+|-|&|\.)/) // Split on spaces, hyphens, ampersands, periods but keep delimiters
    .map((part, index) => {
      // Keep delimiters as-is
      if (/^[\s\-&\.]$/.test(part)) return part;

      const lower = part.toLowerCase();

      // First word is always capitalized
      if (index === 0) {
        // Check if it's an uppercase word
        if (uppercase.includes(lower)) {
          return part.toUpperCase();
        }
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }

      // Check if should stay lowercase
      if (lowercase.includes(lower)) {
        return lower;
      }

      // Check if should be uppercase
      if (uppercase.includes(lower)) {
        return part.toUpperCase();
      }

      // Preserve existing capitalization for single uppercase letters
      if (part.length === 1 && part === part.toUpperCase()) {
        return part;
      }

      // Default title case
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

async function normalizeVendorCapitalization() {
  const supabase = createAdminClient();

  console.log('\n📝 Normalizing vendor name capitalization...\n');

  // Get all vendors
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .order('name');

  if (error) {
    console.error('❌ Failed to fetch vendors:', error.message);
    return;
  }

  if (!vendors || vendors.length === 0) {
    console.log('No vendors found.');
    return;
  }

  console.log(`Found ${vendors.length} vendors to process.\n`);

  let updated = 0;
  let skipped = 0;

  for (const vendor of vendors) {
    const properName = toProperCase(vendor.name);

    if (properName === vendor.name) {
      skipped++;
      continue;
    }

    console.log(`Updating: "${vendor.name}" → "${properName}"`);

    const { error: updateError } = await supabase
      .from('vendors')
      .update({ name: properName })
      .eq('id', vendor.id);

    if (updateError) {
      console.error(`  ❌ Failed: ${updateError.message}`);
    } else {
      console.log(`  ✅ Updated`);
      updated++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Updated: ${updated}`);
  console.log(`  ⏭️  Skipped (already correct): ${skipped}`);
  console.log(`  📝 Total vendors: ${vendors.length}`);
}

normalizeVendorCapitalization()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
