/**
 * Seed Product Weights Script
 * Creates items and product weights from the example data
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedProductWeights() {
  console.log('🌱 Seeding product weights...\n');

  // Get first venue
  const { data: venues } = await supabase
    .from('venues')
    .select('id')
    .limit(1);

  if (!venues || venues.length === 0) {
    console.error('❌ No venues found. Please create a venue first.');
    return;
  }

  const venueId = venues[0].id;
  console.log(`✓ Using venue: ${venueId}\n`);

  const products = [
    {
      upc_ean: '012345678901',
      brand: "Jack Daniel's",
      product_name: "Jack Daniel's Old No. 7 Tennessee Whiskey",
      size_ml: 750,
      abv_percent: 40.0,
      empty_g: 485.5,
      full_g: 1200.3,
      source: 'seed_list',
      source_ref: 'manufacturer_spec',
      category: 'beverage',
      base_uom: 'bottle',
    },
    {
      upc_ean: '098765432109',
      brand: "Tito's",
      product_name: "Tito's Handmade Vodka",
      size_ml: 1000,
      abv_percent: 40.0,
      empty_g: 520.8,
      full_g: 1465.2,
      source: 'measured',
      source_ref: 'scale_reading_2024-01',
      category: 'beverage',
      base_uom: 'bottle',
    },
  ];

  for (const product of products) {
    console.log(`📦 Processing: ${product.product_name}...`);

    // Create item
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        name: product.product_name,
        sku: product.upc_ean,
        category: product.category,
        base_uom: product.base_uom,
        is_active: true,
      })
      .select()
      .single();

    if (itemError) {
      console.error(`  ❌ Error creating item: ${itemError.message}`);
      continue;
    }

    console.log(`  ✓ Created item: ${item.id}`);

    // Create product weight
    const { error: weightError } = await supabase
      .from('product_weights')
      .insert({
        sku_id: item.id,
        upc_ean: product.upc_ean,
        brand: product.brand,
        product_name: product.product_name,
        size_ml: product.size_ml,
        abv_percent: product.abv_percent,
        empty_g: product.empty_g,
        empty_g_source: product.source,
        empty_g_source_ref: product.source_ref,
        full_g: product.full_g,
        full_g_source: product.source,
        full_g_source_ref: product.source_ref,
      });

    if (weightError) {
      console.error(`  ❌ Error creating product weight: ${weightError.message}`);
      continue;
    }

    console.log(`  ✓ Created product weight`);
    console.log(`    • Size: ${product.size_ml}ml @ ${product.abv_percent}% ABV`);
    console.log(`    • Tare: ${product.empty_g}g, Full: ${product.full_g}g`);
    console.log('');
  }

  console.log('✅ Seed complete!\n');
}

seedProductWeights().catch(console.error);
