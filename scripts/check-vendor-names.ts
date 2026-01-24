import { createClient } from '@supabase/supabase-js';

async function checkVendorNames() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  // Get all vendors for h.wood org
  const { data: vendors } = await supabase
    .from('vendors')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  console.log('='.repeat(80));
  console.log('VENDOR NAMES AUDIT - H.WOOD GROUP');
  console.log('='.repeat(80));
  console.log(`\nTotal vendors: ${vendors?.length || 0}\n`);

  if (vendors && vendors.length > 0) {
    console.log('All vendors:');
    vendors.forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.name} (ID: ${v.id})`);
    });
  }

  // Look for potential duplicates
  console.log('\n' + '-'.repeat(80));
  console.log('POTENTIAL DUPLICATES');
  console.log('-'.repeat(80));

  const nameGroups = new Map<string, any[]>();

  vendors?.forEach(vendor => {
    // Normalize: lowercase, remove punctuation, remove spaces
    const normalized = vendor.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (!nameGroups.has(normalized)) {
      nameGroups.set(normalized, []);
    }
    nameGroups.get(normalized)!.push(vendor);
  });

  const duplicates = Array.from(nameGroups.entries())
    .filter(([_, vendors]) => vendors.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ No duplicate vendors found');
  } else {
    console.log(`⚠️  Found ${duplicates.length} potential duplicate groups:\n`);
    duplicates.forEach(([normalized, vendorGroup]) => {
      console.log(`Group: "${normalized}"`);
      vendorGroup.forEach(v => {
        console.log(`  - ${v.name} (${v.id})`);
      });
      console.log('');
    });
  }

  // Check for Spec's variations
  console.log('-'.repeat(80));
  console.log('SPEC\'S VENDOR VARIATIONS');
  console.log('-'.repeat(80));

  const specsVendors = vendors?.filter(v =>
    v.name.toLowerCase().includes('spec')
  );

  if (specsVendors && specsVendors.length > 0) {
    console.log(`Found ${specsVendors.length} Spec's-related vendors:\n`);
    specsVendors.forEach(v => {
      console.log(`  - ${v.name} (${v.id})`);
    });
  } else {
    console.log('No Spec\'s vendors found');
  }

  console.log('\n' + '='.repeat(80));
}

checkVendorNames();
