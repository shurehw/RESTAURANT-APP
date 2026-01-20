import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function runMigration() {
  console.log('🔧 Running migration 119: Fix GL suggestion ambiguity\n');

  const sql = readFileSync('supabase/migrations/119_fix_gl_suggestion_ambiguity.sql', 'utf-8');

  // Use Supabase's postgres client directly via pg
  const { Pool } = await import('pg');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(sql);
    console.log('✅ Migration 119 executed successfully\n');
  } catch (error: any) {
    console.error('❌ Error running migration:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.hint) console.error('Hint:', error.hint);
  } finally {
    await pool.end();
  }

  // Test the function
  console.log('Testing fixed function...\n');

  const { data: testOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', 'The h.wood Group')
    .single();

  if (!testOrg) {
    console.log('⚠️  Could not find test organization');
    return;
  }

  const { data: testItem } = await supabase
    .from('items')
    .select('id, name, category')
    .eq('organization_id', testOrg.id)
    .limit(1)
    .single();

  if (!testItem) {
    console.log('⚠️  No items found to test with');
    return;
  }

  console.log(`Testing with item: ${testItem.name} (${testItem.category})\n`);

  const { data: suggestions, error: suggestionError } = await supabase
    .rpc('suggest_gl_account_for_item_v2', {
      p_item_id: testItem.id,
      p_organization_id: testOrg.id,
      p_vendor_id: null,
    });

  if (suggestionError) {
    console.error('❌ Function test failed:', suggestionError);
    return;
  }

  console.log(`✅ Function test passed! Got ${suggestions?.length || 0} suggestions\n`);

  if (suggestions && suggestions.length > 0) {
    console.log('Sample suggestions:');
    suggestions.slice(0, 3).forEach((s: any, i: number) => {
      console.log(`  ${i + 1}. [${s.confidence}] ${s.external_code} - ${s.name} (${s.reason})`);
    });
  }

  console.log('\n✅ All pre-flight checks should now pass!\n');
}

runMigration();
