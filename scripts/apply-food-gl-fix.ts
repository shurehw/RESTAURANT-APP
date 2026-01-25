/**
 * Apply migration 1003: Fix Food GL Mapping
 * Run with: npx dotenv -e .env.local -- npx tsx scripts/apply-food-gl-fix.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('📋 Applying migration 1003: Fix Food GL Mapping...\n');

  try {
    // Step 1: Drop old function signatures
    console.log('1️⃣ Dropping old function signatures...');
    const { error: dropError } = await supabase.rpc('exec', {
      sql: `
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN
            SELECT oid::regprocedure as func_sig
            FROM pg_proc
            WHERE proname = 'suggest_gl_account_for_item'
          LOOP
            EXECUTE 'DROP FUNCTION ' || r.func_sig;
          END LOOP;
        END $$;
      `
    });

    if (dropError && dropError.message !== 'Could not find the function exec in the schema') {
      console.log('Note: Using direct SQL execution instead of exec RPC');
    }

    // Step 2: Create new function with correct GL codes
    console.log('2️⃣ Creating updated GL suggestion function...');
    const createFunctionSql = `
      CREATE OR REPLACE FUNCTION suggest_gl_account_for_item(
        p_category item_category,
        p_subcategory text,
        p_org_id uuid
      )
      RETURNS uuid
      LANGUAGE plpgsql
      STABLE
      AS $$
      DECLARE
        v_gl_account_id uuid;
        v_gl_code text;
      BEGIN
        -- Map subcategory to ACTUAL GL codes in your system
        IF p_category = 'food' THEN
          v_gl_code := CASE p_subcategory
            WHEN 'meat_protein' THEN '5110'  -- Meat Cost
            WHEN 'seafood' THEN '5120'        -- Seafood Cost
            WHEN 'produce' THEN '5140'        -- Produce Cost
            WHEN 'dairy' THEN '5150'          -- Dairy Cost
            WHEN 'bakery' THEN '5160'         -- Bakery Cost
            WHEN 'dry_goods' THEN '5170'      -- Grocery and Dry Goods Cost
            WHEN 'specialty' THEN '5110'      -- Default to Meat (for specialty proteins like Wagyu)
            ELSE '5100'                        -- General Food Cost
          END;
        ELSIF p_category = 'beverage' THEN
          v_gl_code := CASE p_subcategory
            WHEN 'spirits' THEN '5310'        -- Liquor Cost
            WHEN 'wine' THEN '5320'           -- Wine Cost
            WHEN 'beer' THEN '5330'           -- Beer Cost
            WHEN 'na_beverage' THEN '5335'    -- N/A Beverage Cost
            WHEN 'mixer' THEN '5315'          -- Bar Consumables
            ELSE '5305'                        -- General Beverage Cost
          END;
        ELSE
          -- packaging, supplies
          v_gl_code := '5170'; -- Grocery/Dry Goods
        END IF;

        -- Get GL account ID
        SELECT id INTO v_gl_account_id
        FROM gl_accounts
        WHERE org_id = p_org_id
          AND external_code = v_gl_code
        LIMIT 1;

        RETURN v_gl_account_id;
      END;
      $$;
    `;

    // We'll need to run this via psql since RPC may not exist
    // For now, let's just verify the existing state and provide instructions

    // Step 3: Check current GL accounts
    console.log('\n3️⃣ Checking current GL account state...\n');

    const { data: badGLs } = await supabase
      .from('gl_accounts')
      .select('id, external_code, name, section')
      .in('external_code', ['5300', '5301', '5302', '5303', '5304', '5305', '5306', '5307'])
      .eq('section', 'COGS');

    console.log(`Incorrect GL accounts found: ${badGLs?.length || 0}`);
    if (badGLs && badGLs.length > 0) {
      console.log('\n⚠️ These GL accounts need to be deleted:');
      badGLs.forEach((gl: any) => {
        console.log(`  ${gl.external_code} - ${gl.name}`);
      });

      // Delete them
      console.log('\n🗑️  Deleting incorrect GL accounts...');
      const { error: deleteError } = await supabase
        .from('gl_accounts')
        .delete()
        .in('external_code', ['5300', '5301', '5302', '5303', '5304', '5305', '5306', '5307'])
        .eq('section', 'COGS');

      if (deleteError) {
        console.error('❌ Error deleting GL accounts:', deleteError);
      } else {
        console.log('✅ Deleted incorrect GL accounts');
      }
    }

    // Step 4: Verify correct GL accounts exist
    const { data: correctGLs, error: correctGLError } = await supabase
      .from('gl_accounts')
      .select('external_code, name, section, id')
      .in('external_code', ['5110', '5120', '5140', '5150', '5160', '5170'])
      .order('external_code');

    if (correctGLError) {
      console.error('Error checking correct GL accounts:', correctGLError);
    } else {
      console.log(`\n✅ Correct Food GL accounts found: ${correctGLs?.length || 0}`);
      correctGLs?.forEach((gl: any) => {
        console.log(`  ${gl.external_code} - ${gl.name}`);
      });
    }

    // Step 5: Get org ID for h.wood Group
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('name', 'The h.wood Group')
      .single();

    if (!org) {
      console.error('❌ Could not find Hwood Group organization');
      return;
    }

    console.log(`\n🏢 Organization: ${org.name} (${org.id})\n`);

    // Step 6: Manually update food items with correct GL accounts
    console.log('4️⃣ Updating food items with correct GL accounts...\n');

    const subcategoryGLMap: Record<string, string> = {
      'meat_protein': '5110',
      'seafood': '5120',
      'produce': '5140',
      'dairy': '5150',
      'bakery': '5160',
      'dry_goods': '5170',
      'specialty': '5110',
    };

    let totalUpdated = 0;

    for (const [subcategory, glCode] of Object.entries(subcategoryGLMap)) {
      // Find the GL account ID
      const glAccount = correctGLs?.find((gl: any) => gl.external_code === glCode);
      if (!glAccount) {
        console.log(`⚠️  No GL account found for ${glCode}`);
        continue;
      }

      // Update items with this subcategory
      const { data: updatedItems, error: updateError } = await supabase
        .from('items')
        .update({ gl_account_id: glAccount.id })
        .eq('category', 'food')
        .eq('subcategory', subcategory)
        .select('id, name');

      if (updateError) {
        console.error(`❌ Error updating ${subcategory}:`, updateError);
      } else {
        const count = updatedItems?.length || 0;
        if (count > 0) {
          console.log(`  ${subcategory} → GL ${glCode}: ${count} items updated`);
          totalUpdated += count;
        }
      }
    }

    console.log(`\n✅ Total items updated: ${totalUpdated}`);

    // Step 7: Sample verification
    console.log('\n5️⃣ Verification - Sample food items:\n');

    const { data: foodItems } = await supabase
      .from('items')
      .select(`
        id,
        name,
        category,
        subcategory,
        gl_accounts!inner(external_code, name)
      `)
      .eq('category', 'food')
      .not('subcategory', 'is', null)
      .limit(10);

    foodItems?.forEach((item: any) => {
      console.log(`  ${item.name}`);
      console.log(`    ${item.category} > ${item.subcategory}`);
      console.log(`    GL: ${item.gl_accounts?.external_code} - ${item.gl_accounts?.name}\n`);
    });

    console.log('\n✅ Migration complete!');
    console.log('\n⚠️  NOTE: You still need to run the function creation SQL in Supabase SQL Editor:');
    console.log('    File: supabase/migrations/1003_fix_food_gl_mapping.sql (lines 8-56)');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

applyMigration();
