/**
 * Create Ben E Keith vendor and reassign Delilah Dallas LLC invoices
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createBenEKeith() {
  console.log('🏢 Creating Ben E Keith vendor...\n');

  // Get organization ID (h.wood Group)
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%h.wood%')
    .single();

  if (!org) {
    console.log('❌ Could not find organization');
    return;
  }

  console.log(`Organization: ${org.name} (${org.id})\n`);

  // Create Ben E Keith vendor
  const vendorName = 'Ben E Keith';
  const normalizedName = 'ben e keith';

  const { data: newVendor, error: createError } = await supabase
    .from('vendors')
    .insert({
      name: vendorName,
      normalized_name: normalizedName,
      organization_id: org.id,
      is_active: true
    })
    .select()
    .single();

  if (createError) {
    if (createError.message.includes('duplicate') || createError.code === '23505') {
      console.log('⚠️  Ben E Keith vendor already exists, finding it...');
      const { data: existing } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('normalized_name', normalizedName)
        .eq('organization_id', org.id)
        .single();

      if (existing) {
        console.log(`Found: ${existing.name} (${existing.id})\n`);
        await reassignInvoices(existing.id);
      }
      return;
    }
    console.error('❌ Failed to create vendor:', createError);
    throw createError;
  }

  console.log(`✅ Created vendor: ${newVendor.name} (${newVendor.id})\n`);

  await reassignInvoices(newVendor.id);
}

async function reassignInvoices(benEKeithId: string) {
  console.log('📋 Reassigning invoices...\n');

  // Find the incorrect vendor
  const { data: delilahVendor } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Delilah Dallas%')
    .single();

  if (!delilahVendor) {
    console.log('✅ No incorrect vendor found');
    return;
  }

  // Get invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount')
    .eq('vendor_id', delilahVendor.id);

  if (!invoices || invoices.length === 0) {
    console.log('No invoices to reassign');
    return;
  }

  console.log(`Reassigning ${invoices.length} invoices:\n`);
  invoices.forEach(inv => {
    console.log(`  - ${inv.invoice_number} (${inv.invoice_date}) - $${inv.total_amount}`);
  });

  // Update invoices
  const { error: updateError } = await supabase
    .from('invoices')
    .update({ vendor_id: benEKeithId })
    .eq('vendor_id', delilahVendor.id);

  if (updateError) {
    console.error('❌ Failed to update:', updateError);
    throw updateError;
  }

  console.log('\n✅ Successfully reassigned all invoices!');

  // Delete old vendor
  console.log(`\nDeleting unused vendor "${delilahVendor.name}"...`);
  const { error: deleteError } = await supabase
    .from('vendors')
    .delete()
    .eq('id', delilahVendor.id);

  if (deleteError) {
    console.error('Could not delete vendor:', deleteError.message);
  } else {
    console.log('✅ Deleted unused vendor');
  }

  console.log('\n✨ Done!');
}

createBenEKeith().catch(console.error);
