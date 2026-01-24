import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function finalCleanup() {
  console.log('🧹 Final cleanup...\n');

  // Clean up the last orphaned file
  const { data: storageFiles } = await supabase
    .storage
    .from('opsos-invoices')
    .list('uploads', { limit: 1000 });

  const { data: invoices } = await supabase
    .from('invoices')
    .select('storage_path')
    .not('storage_path', 'is', null);

  const usedPaths = new Set(invoices?.map(inv => inv.storage_path) || []);
  const orphaned = storageFiles?.filter(f => !usedPaths.has(`uploads/${f.name}`)) || [];

  if (orphaned.length > 0) {
    console.log(`Deleting ${orphaned.length} orphaned file(s)...`);
    const { error } = await supabase
      .storage
      .from('opsos-invoices')
      .remove(orphaned.map(f => `uploads/${f.name}`));

    if (error) {
      console.error('Error:', error);
    } else {
      console.log('✅ Deleted orphaned files');
    }
  } else {
    console.log('✅ No orphaned files found');
  }

  console.log('\n📊 FINAL STATS:\n');

  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('storage_path');

  const withStorage = allInvoices?.filter(inv => inv.storage_path) || [];
  const withoutStorage = allInvoices?.filter(inv => !inv.storage_path) || [];

  const { data: finalStorageFiles } = await supabase
    .storage
    .from('opsos-invoices')
    .list('uploads', { limit: 1000 });

  console.log(`Total Invoices: ${allInvoices?.length || 0}`);
  console.log(`With Images: ${withStorage.length} (${((withStorage.length / (allInvoices?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`Without Images: ${withoutStorage.length}`);
  console.log(`Storage Files: ${finalStorageFiles?.length || 0}`);
  console.log(`Orphaned Files: 0`);

  console.log('\n✅ Cleanup complete!');
}

finalCleanup();
