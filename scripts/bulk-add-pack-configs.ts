/**
 * Bulk Add Pack Configurations
 * Helps add standard pack configs to items missing them
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as readline from 'readline';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

// Standard pack templates by category
const PACK_TEMPLATES: Record<string, Array<{
  pack_type: string;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
  description: string;
}>> = {
  'beer': [
    { pack_type: 'case', units_per_pack: 24, unit_size: 12, unit_size_uom: 'oz', description: '24-pack 12oz cans' },
    { pack_type: 'case', units_per_pack: 12, unit_size: 12, unit_size_uom: 'oz', description: '12-pack 12oz bottles' },
    { pack_type: 'keg', units_per_pack: 1, unit_size: 15.5, unit_size_uom: 'gal', description: 'Half barrel keg' }
  ],
  'wine': [
    { pack_type: 'case', units_per_pack: 6, unit_size: 750, unit_size_uom: 'mL', description: 'Case of 6/750mL' },
    { pack_type: 'case', units_per_pack: 12, unit_size: 750, unit_size_uom: 'mL', description: 'Case of 12/750mL' },
    { pack_type: 'bottle', units_per_pack: 1, unit_size: 750, unit_size_uom: 'mL', description: 'Single 750mL bottle' }
  ],
  'liquor': [
    { pack_type: 'case', units_per_pack: 6, unit_size: 750, unit_size_uom: 'mL', description: 'Case of 6/750mL' },
    { pack_type: 'bottle', units_per_pack: 1, unit_size: 750, unit_size_uom: 'mL', description: 'Single 750mL bottle' },
    { pack_type: 'bottle', units_per_pack: 1, unit_size: 1, unit_size_uom: 'L', description: 'Single 1L bottle' }
  ],
  'food': [
    { pack_type: 'case', units_per_pack: 1, unit_size: 50, unit_size_uom: 'lb', description: '50lb case' },
    { pack_type: 'bag', units_per_pack: 1, unit_size: 5, unit_size_uom: 'lb', description: '5lb bag' },
    { pack_type: 'box', units_per_pack: 1, unit_size: 10, unit_size_uom: 'lb', description: '10lb box' }
  ],
  'smallwares': [
    { pack_type: 'case', units_per_pack: 100, unit_size: 1, unit_size_uom: 'ea', description: 'Case of 100' },
    { pack_type: 'box', units_per_pack: 50, unit_size: 1, unit_size_uom: 'ea', description: 'Box of 50' },
    { pack_type: 'each', units_per_pack: 1, unit_size: 1, unit_size_uom: 'ea', description: 'Each' }
  ],
  'default': [
    { pack_type: 'each', units_per_pack: 1, unit_size: 1, unit_size_uom: 'ea', description: 'Each' }
  ]
};

async function bulkAddPackConfigs() {
  console.log('📦 Bulk Add Pack Configurations Tool\n');

  // Get items without pack configs
  const { data: items, error } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      category,
      base_uom,
      item_pack_configurations(id)
    `)
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error fetching items:', error);
    return;
  }

  const itemsNeedingPacks = items?.filter(
    (item) => !(item as any).item_pack_configurations || (item as any).item_pack_configurations.length === 0
  ) || [];

  if (itemsNeedingPacks.length === 0) {
    console.log('✅ All items already have pack configurations!');
    rl.close();
    return;
  }

  console.log(`Found ${itemsNeedingPacks.length} items without pack configurations\n`);

  // Group by category
  const byCategory = itemsNeedingPacks.reduce((acc, item) => {
    const cat = item.category || 'unknown';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof itemsNeedingPacks>);

  console.log('Items by Category:');
  Object.entries(byCategory).forEach(([cat, items]) => {
    console.log(`  ${cat}: ${items.length} items`);
  });
  console.log('');

  const mode = await prompt('Choose mode:\n  1. Auto-apply standard packs by category\n  2. Interactive (review each item)\n  3. Exit\n\nChoice (1-3): ');

  if (mode === '3') {
    console.log('Exiting...');
    rl.close();
    return;
  }

  if (mode === '1') {
    // Auto mode
    console.log('\n🤖 Auto-applying standard pack configurations...\n');

    let added = 0;
    for (const item of itemsNeedingPacks) {
      const category = item.category?.toLowerCase() || 'default';
      const templates = PACK_TEMPLATES[category] || PACK_TEMPLATES.default;

      // Add first template only (most common pack size)
      const template = templates[0];

      const { error: insertError } = await supabase
        .from('item_pack_configurations')
        .insert({
          item_id: item.id,
          pack_type: template.pack_type,
          units_per_pack: template.units_per_pack,
          unit_size: template.unit_size,
          unit_size_uom: template.unit_size_uom
        });

      if (insertError) {
        console.error(`❌ Error adding pack for ${item.sku}:`, insertError.message);
      } else {
        console.log(`✅ ${item.sku} - ${item.name}: Added ${template.description}`);
        added++;
      }
    }

    console.log(`\n✅ Added pack configurations to ${added} items`);

  } else if (mode === '2') {
    // Interactive mode
    console.log('\n📝 Interactive Mode\n');
    console.log('For each item, choose a pack configuration or skip.\n');

    for (const item of itemsNeedingPacks) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 ${item.sku} - ${item.name}`);
      console.log(`   Category: ${item.category || 'N/A'} | Base UOM: ${item.base_uom}`);

      const category = item.category?.toLowerCase() || 'default';
      const templates = PACK_TEMPLATES[category] || PACK_TEMPLATES.default;

      console.log('\nAvailable templates:');
      templates.forEach((t, idx) => {
        console.log(`  ${idx + 1}. ${t.description} (${t.units_per_pack} x ${t.unit_size}${t.unit_size_uom})`);
      });
      console.log(`  ${templates.length + 1}. Custom`);
      console.log(`  S. Skip this item`);

      const choice = await prompt('\nChoice: ');

      if (choice.toLowerCase() === 's') {
        console.log('⏭️  Skipped');
        continue;
      }

      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < templates.length) {
        // Use template
        const template = templates[idx];
        const { error: insertError } = await supabase
          .from('item_pack_configurations')
          .insert({
            item_id: item.id,
            pack_type: template.pack_type,
            units_per_pack: template.units_per_pack,
            unit_size: template.unit_size,
            unit_size_uom: template.unit_size_uom
          });

        if (insertError) {
          console.error(`❌ Error:`, insertError.message);
        } else {
          console.log(`✅ Added: ${template.description}`);
        }

      } else if (idx === templates.length) {
        // Custom
        console.log('\n🔧 Custom Pack Configuration:');
        const packType = await prompt('  Pack Type (case/bottle/bag/box/each/keg): ');
        const unitsPer = await prompt('  Units Per Pack: ');
        const unitSize = await prompt('  Unit Size: ');
        const unitUom = await prompt('  Unit UOM (mL/L/oz/lb/ea): ');

        const { error: insertError } = await supabase
          .from('item_pack_configurations')
          .insert({
            item_id: item.id,
            pack_type: packType,
            units_per_pack: parseFloat(unitsPer),
            unit_size: parseFloat(unitSize),
            unit_size_uom: unitUom
          });

        if (insertError) {
          console.error(`❌ Error:`, insertError.message);
        } else {
          console.log(`✅ Added custom pack configuration`);
        }
      }
    }

    console.log('\n✅ Interactive session complete');
  }

  rl.close();
}

bulkAddPackConfigs().catch(console.error);
