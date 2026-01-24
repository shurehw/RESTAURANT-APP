import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanupOrphanedFiles() {
  console.log('🔍 Finding orphaned files in storage...\n');

  // Get all storage files
  const { data: storageFiles, error: storageError } = await supabase
    .storage
    .from('opsos-invoices')
    .list('uploads', { limit: 1000 });

  if (storageError) {
    console.error('Error fetching storage files:', storageError);
    return;
  }

  console.log(`📁 Total files in storage: ${storageFiles?.length || 0}`);

  // Get all invoices with storage paths
  const { data: invoices } = await supabase
    .from('invoices')
    .select('storage_path')
    .not('storage_path', 'is', null);

  const usedPaths = new Set(invoices?.map(inv => inv.storage_path) || []);
  console.log(`📋 Total invoices with storage_path: ${usedPaths.size}\n`);

  // Find orphaned files
  const orphaned = storageFiles?.filter(file =>
    !usedPaths.has(`uploads/${file.name}`)
  ) || [];

  console.log(`🗑️  Orphaned files found: ${orphaned.length}\n`);

  if (orphaned.length === 0) {
    console.log('✅ No orphaned files to clean up!');
    return;
  }

  console.log('First 10 orphaned files:');
  orphaned.slice(0, 10).forEach(file => {
    console.log(`  - ${file.name} (${new Date(file.created_at).toLocaleDateString()})`);
  });

  console.log(`\n⚠️  Ready to delete ${orphaned.length} orphaned files.`);
  console.log('💡 These files are in storage but not linked to any invoice.\n');

  // Delete orphaned files in batches
  let deleted = 0;
  const batchSize = 10;

  for (let i = 0; i < orphaned.length; i += batchSize) {
    const batch = orphaned.slice(i, i + batchSize);
    const filePaths = batch.map(f => `uploads/${f.name}`);

    const { error } = await supabase
      .storage
      .from('opsos-invoices')
      .remove(filePaths);

    if (error) {
      console.error(`❌ Error deleting batch ${i / batchSize + 1}:`, error.message);
    } else {
      deleted += filePaths.length;
      console.log(`✅ Deleted batch ${i / batchSize + 1} (${filePaths.length} files)`);
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deleted} orphaned files.`);
}

cleanupOrphanedFiles();
