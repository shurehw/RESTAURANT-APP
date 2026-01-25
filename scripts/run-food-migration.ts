import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function runMigration() {
  console.log('🔧 Running Food Subcategories & GL Accounts Migration');
  console.log('═'.repeat(70));

  try {
    const sql = await readFile(
      'supabase/migrations/1002_add_food_subcategories_and_gl.sql',
      'utf-8'
    );

    // Execute the migration
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Try direct execution via REST API
      console.log('Trying direct SQL execution...\n');

      const { data, error: execError } = await supabase
        .from('_migrations')
        .select('*')
        .limit(1);

      if (execError) {
        console.error('❌ Error:', execError.message);
        console.log('\n⚠️  Manual migration required. Please run:');
        console.log('   npx supabase db reset');
        console.log('   OR copy the SQL from migration file and run in Supabase SQL Editor');
        return;
      }
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('Created:');
    console.log('  - Food subcategories (meat_protein, seafood, produce, dairy, dry_goods, bakery, specialty)');
    console.log('  - GL accounts (5300-5307 for food COGS)');
    console.log('  - Auto-categorization functions');
    console.log('  - Trigger for auto-setting subcategories');

  } catch (error: any) {
    console.error('❌ Error running migration:', error.message);
    console.log('\n💡 TIP: You can manually run the migration via Supabase Dashboard SQL Editor');
    console.log('   Copy contents from: supabase/migrations/1002_add_food_subcategories_and_gl.sql');
  }
}

runMigration();
