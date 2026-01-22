import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDoubled() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name')
    .eq('is_active', true);

  let fixed = 0;

  for (const item of items || []) {
    // Fix patterns like "Item 1each 1each" or "Item 1case 1case"
    const doubled = item.name.match(/^(.+?)\s+(\d+(?:,\d+)?)(each|case|pack|quart|qt)\s+\2\3$/i);

    if (doubled) {
      const newName = `${doubled[1]} ${doubled[2]}${doubled[3]}`;

      await supabase
        .from('items')
        .update({ name: newName })
        .eq('id', item.id);

      console.log(`✓ ${item.name} → ${newName}`);
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} doubled names`);
}

fixDoubled().catch(console.error);
