import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifySync() {
  const { data: storageFiles } = await supabase
    .storage
    .from('opsos-invoices')
    .list('uploads', { limit: 1000 });

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, storage_path')
    .not('storage_path', 'is', null);

  console.log('📁 Storage files:', storageFiles?.length || 0);
  console.log('📋 Invoices with storage_path:', invoices?.length || 0);
  console.log('');

  const usedPaths = new Set(invoices?.map(inv => inv.storage_path) || []);
  const orphaned = storageFiles?.filter(f => !usedPaths.has(`uploads/${f.name}`)) || [];

  console.log('Storage files:');
  storageFiles?.forEach(f => console.log(`  - uploads/${f.name}`));

  console.log('\nInvoice storage paths:');
  invoices?.forEach(inv => console.log(`  - ${inv.storage_path}`));

  console.log(`\n🗑️  Orphaned: ${orphaned.length}`);
  orphaned.forEach(f => console.log(`  - ${f.name}`));

  // Delete the orphaned one
  if (orphaned.length > 0) {
    const { error } = await supabase
      .storage
      .from('opsos-invoices')
      .remove(orphaned.map(f => `uploads/${f.name}`));

    if (error) {
      console.error('\n❌ Error deleting:', error);
    } else {
      console.log(`\n✅ Deleted ${orphaned.length} orphaned file(s)`);
    }
  }
}

verifySync();
