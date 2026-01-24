import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function unmapItems() {
  // Get the invoice ID from the user or find items with these specific mappings
  const incorrectMappings = [
    { description: 'Hap 3L Grapefruit*Fresh Jul 3LT', item_code: '333357' },
    { description: 'Hap 3L Lemon*Fresh Juice 3LT', item_code: '333357' },
    { description: 'Hap 3L Lime*Fresh Juice 3LT', item_code: '333357' },
    { description: 'Hap 3L Orange*Fresh Juice 3LT', item_code: '333357' },
    { description: 'Hap 3L Pineapple*Fresh Juic 3LT', item_code: '333357' },
    { description: 'Christian Bros Brandy 1.75LT', item_code: '48264' },
    { description: 'Noilly Prat Vermouth Origin 1LT', item_code: '960684' },
    { description: 'Noilly Prat Vermouth Sweet 1LT', item_code: '960684' },
    { description: "Ron Carina Barbis'I 1LT", item_code: '10476758' },
  ];

  console.log('🔍 Finding incorrectly mapped items...\n');

  for (const mapping of incorrectMappings) {
    const { data: items, error } = await supabase
      .from('invoice_items')
      .update({
        item_id: null,
        item_code: null
      })
      .ilike('description', mapping.description)
      .select();

    if (error) {
      console.log(`❌ Error unmapping "${mapping.description}":`, error.message);
    } else {
      console.log(`✅ Unmapped ${items?.length || 0} item(s): "${mapping.description}"`);
    }
  }

  console.log('\n✅ Done! All items have been unmapped.');
}

unmapItems();
