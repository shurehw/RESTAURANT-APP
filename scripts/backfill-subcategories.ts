import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function backfillSubcategories() {
  console.log('Fetching items with missing subcategories...\n');

  // Get all items that are liquor but have no subcategory
  const { data: items } = await supabase
    .from('items')
    .select('id, name, category, subcategory')
    .is('subcategory', null)
    .eq('is_active', true);

  console.log(`Found ${items?.length || 0} items with missing subcategories\n`);

  if (!items || items.length === 0) {
    console.log('No items to update!');
    return;
  }

  // Extract subcategory from item name
  const updates: Array<{ id: string; subcategory: string }> = [];

  for (const item of items) {
    const name = item.name.toLowerCase();
    let subcategory = null;

    // Detect subcategory from item name
    if (/(tequila|mezcal)/i.test(name)) {
      subcategory = 'Tequila';
    } else if (/(whiskey|bourbon|rye|scotch)/i.test(name)) {
      subcategory = 'Whiskey';
    } else if (/vodka/i.test(name)) {
      subcategory = 'Vodka';
    } else if (/gin/i.test(name)) {
      subcategory = 'Gin';
    } else if (/(rum|rhum)/i.test(name)) {
      subcategory = 'Rum';
    } else if (/(cognac|brandy|armagnac)/i.test(name)) {
      subcategory = 'Cognac';
    } else if (/(liqueur|amaro|aperol|campari|chartreuse|benedictine|cointreau|triple.sec|st.germain|kahlua|baileys|frangelico|amaretto|curacao|schnapps|creme.de)/i.test(name)) {
      subcategory = 'Liqueur';
    } else if (/(vermouth|lillet|cocchi|dolin)/i.test(name)) {
      subcategory = 'Liqueur';
    } else if (/wine/i.test(name)) {
      subcategory = 'Wine';
    } else if (/(beer|ale|lager|ipa|stout|porter)/i.test(name)) {
      subcategory = 'Beer';
    }

    if (subcategory) {
      updates.push({ id: item.id, subcategory });
      console.log(`${item.name} → ${subcategory}`);
    } else {
      console.log(`⚠️  Could not detect subcategory for: ${item.name}`);
    }
  }

  console.log(`\nUpdating ${updates.length} items...\n`);

  // Update in batches
  let updated = 0;
  let failed = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('items')
      .update({ subcategory: update.subcategory })
      .eq('id', update.id);

    if (error) {
      console.error(`Failed to update ${update.id}:`, error.message);
      failed++;
    } else {
      updated++;
    }
  }

  console.log(`\n✅ Updated: ${updated}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Skipped (couldn't detect): ${items.length - updates.length}`);
}

backfillSubcategories();
