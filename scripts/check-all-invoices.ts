import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, storage_path, created_at')
    .order('created_at', { ascending: false });

  const withStorage = allInvoices?.filter(inv => inv.storage_path) || [];
  const withoutStorage = allInvoices?.filter(inv => !inv.storage_path) || [];

  console.log('📊 DATABASE CHECK');
  console.log('Total Invoices:', allInvoices?.length || 0);
  console.log('With storage_path:', withStorage.length);
  console.log('Without storage_path:', withoutStorage.length);
  console.log('');

  const { data: storageFiles } = await supabase
    .storage
    .from('opsos-invoices')
    .list('uploads', { limit: 1000 });

  console.log('📁 STORAGE CHECK');
  console.log('Total files in storage:', storageFiles?.length || 0);
  console.log('');

  const storagePaths = new Set(withStorage.map(inv => inv.storage_path));
  const orphaned = storageFiles?.filter(f => !storagePaths.has(`uploads/${f.name}`)) || [];

  console.log('🔗 CROSS-REFERENCE');
  console.log('Orphaned files (in storage, not in DB):', orphaned.length);
  console.log('');

  console.log('✅ TESTING ACCESSIBILITY (first 3 with storage)');
  for (const inv of withStorage.slice(0, 3)) {
    const { error } = await supabase.storage.from('opsos-invoices').createSignedUrl(inv.storage_path, 60);
    console.log(`${error ? '❌' : '✅'} ${inv.invoice_number} - ${inv.storage_path}`);
  }

  // Show invoices WITHOUT storage
  if (withoutStorage.length > 0) {
    console.log('\n❌ INVOICES WITHOUT IMAGES:');
    for (const inv of withoutStorage) {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('name')
        .eq('id', inv.vendor_id)
        .single();

      console.log(`  ID: ${inv.id} | Invoice #: ${inv.invoice_number || 'N/A'} | Vendor: ${vendor?.name || 'Unknown'} | Date: ${new Date(inv.invoice_date).toLocaleDateString()}`);
    }
  }

  // Show orphaned files details
  if (orphaned.length > 0) {
    console.log('\n🗑️  ORPHANED FILES (first 20):');
    orphaned.slice(0, 20).forEach(file => {
      console.log(`  - ${file.name} (${new Date(file.created_at).toLocaleDateString()})`);
    });
  }
}

check();
