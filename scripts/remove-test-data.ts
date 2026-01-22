import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function removeTestData() {
  console.log('\n=== Removing Test Data from November 21, 2025 ===\n');

  // Get all items created on that day
  const startDate = '2025-11-21T00:00:00.000Z';
  const endDate = '2025-11-21T23:59:59.999Z';

  const { data: testItems } = await supabase
    .from('items')
    .select('id, name, sku, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .eq('is_active', true);

  console.log(`Found ${testItems?.length || 0} items created on November 21, 2025:\n`);

  testItems?.forEach(item => {
    console.log(`  - ${item.name} (${item.sku})`);
  });

  if (!testItems || testItems.length === 0) {
    console.log('\nNo test items to remove.');
    return;
  }

  console.log(`\n\nDeleting ${testItems.length} test items...`);

  // Soft delete by setting is_active = false
  const itemIds = testItems.map(i => i.id);

  const { error } = await supabase
    .from('items')
    .update({ is_active: false })
    .in('id', itemIds);

  if (error) {
    console.error('Error deleting items:', error);
    return;
  }

  console.log(`✅ Successfully removed ${testItems.length} test items`);

  // Verify
  const { data: remaining } = await supabase
    .from('items')
    .select('id')
    .eq('is_active', true);

  console.log(`\n📊 Active items remaining: ${remaining?.length || 0}`);
}

removeTestData().catch(console.error);
