import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillGLAccounts() {
  console.log('\n=== Backfilling GL Accounts Based on Categories ===\n');

  // First, get all GL accounts to understand what we have
  const { data: glAccounts } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name, section');

  console.log('Available GL Accounts:');
  const costAccounts = glAccounts?.filter(gl => gl.external_code?.startsWith('5')) || [];
  console.log(`Found ${costAccounts.length} COGS accounts (5xxx series)\n`);
  costAccounts.slice(0, 20).forEach(gl => {
    console.log(`  ${gl.external_code} - ${gl.name}`);
  });

  // Category to GL account mapping (based on R365 standard chart of accounts)
  const categoryToGLMapping: Record<string, string> = {
    'liquor': '5310',
    'wine': '5320',
    'beer': '5330',
    'beverage': '5330', // Beer cost
    'non_alcoholic_beverage': '5335',
    'bar_consumables': '5315',
    'food': '5100', // Food cost (if exists)
    'packaging': '5400' // Packaging supplies (if exists)
  };

  // Get items without GL accounts
  const { data: items } = await supabase
    .from('items')
    .select('id, name, category, gl_account_id')
    .eq('is_active', true)
    .is('gl_account_id', null);

  console.log(`\nFound ${items?.length || 0} items without GL accounts\n`);

  let updated = 0;
  let skipped = 0;
  const missingGLAccounts = new Map<string, number>();

  for (const item of items || []) {
    if (!item.category) {
      skipped++;
      continue;
    }

    const glAccountNumber = categoryToGLMapping[item.category];
    if (!glAccountNumber) {
      skipped++;
      console.log(`⚠️  No GL mapping for category: ${item.category} (${item.name})`);
      continue;
    }

    // Find the GL account
    const glAccount = glAccounts?.find(gl => gl.external_code?.startsWith(glAccountNumber));

    if (!glAccount) {
      missingGLAccounts.set(glAccountNumber, (missingGLAccounts.get(glAccountNumber) || 0) + 1);
      continue;
    }

    // Update the item
    const { error } = await supabase
      .from('items')
      .update({ gl_account_id: glAccount.id })
      .eq('id', item.id);

    if (!error) {
      updated++;
      if (updated % 50 === 0) {
        console.log(`Updated ${updated} items...`);
      }
    } else {
      console.error(`Error updating ${item.name}:`, error.message);
    }
  }

  console.log(`\n✅ Updated ${updated} items with GL accounts`);
  console.log(`⏭️  Skipped ${skipped} items (no category or mapping)`);

  if (missingGLAccounts.size > 0) {
    console.log('\n⚠️  Missing GL Accounts in Database:');
    for (const [glNumber, count] of missingGLAccounts.entries()) {
      console.log(`  ${glNumber}: ${count} items need this GL account`);
    }
  }

  // Summary
  const { data: withGL } = await supabase
    .from('items')
    .select('id')
    .eq('is_active', true)
    .not('gl_account_id', 'is', null);

  const { data: totalItems } = await supabase
    .from('items')
    .select('id')
    .eq('is_active', true);

  const coverage = ((withGL?.length || 0) / (totalItems?.length || 1) * 100).toFixed(1);
  console.log(`\n📊 Final GL Account Coverage: ${coverage}% (${withGL?.length}/${totalItems?.length})`);
}

backfillGLAccounts().catch(console.error);
