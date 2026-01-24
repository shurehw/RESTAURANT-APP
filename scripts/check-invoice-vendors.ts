import { createClient } from '@supabase/supabase-js';

async function checkInvoiceVendors() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  // Get venues for h.wood
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('organization_id', orgId);

  const venueIds = venues?.map(v => v.id) || [];

  console.log('H.wood venues:', venues?.map(v => v.name).join(', '));
  console.log('');

  // Get invoices and their vendors
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_id, vendors(id, name)')
    .in('venue_id', venueIds);

  console.log(`Total invoices: ${invoices?.length || 0}\n`);

  const vendorMap = new Map<string, { id: string; name: string }>();

  invoices?.forEach(inv => {
    const vendor = (inv as any).vendors;
    if (vendor) {
      vendorMap.set(vendor.id, vendor);
    }
  });

  console.log('Unique vendors from invoices:');
  Array.from(vendorMap.values()).forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.id})`);
  });

  // Check for Spec's variations
  console.log('\nSpec\'s variations:');
  const specsVendors = Array.from(vendorMap.values()).filter(v =>
    v.name.toLowerCase().includes('spec')
  );

  specsVendors.forEach(v => {
    console.log(`  - ${v.name}`);
  });

  if (specsVendors.length > 1) {
    console.log(`\n⚠️  Found ${specsVendors.length} different Spec's vendor names - these should be merged`);
  }

  // Check all vendors in system
  console.log('\n' + '='.repeat(80));
  const { data: allVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .order('name');

  console.log(`All vendors in system: ${allVendors?.length || 0}\n`);

  // Group by normalized name
  const normalized = new Map<string, any[]>();
  allVendors?.forEach(v => {
    const key = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalized.has(key)) {
      normalized.set(key, []);
    }
    normalized.get(key)!.push(v);
  });

  const dupes = Array.from(normalized.entries()).filter(([_, v]) => v.length > 1);

  if (dupes.length > 0) {
    console.log('⚠️  DUPLICATES FOUND:\n');
    dupes.forEach(([key, vendors]) => {
      console.log(`"${key}"`);
      vendors.forEach(v => {
        console.log(`  - ${v.name} (${v.id})`);
      });
      console.log('');
    });
  }
}

checkInvoiceVendors();
