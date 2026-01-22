import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixConversionFactors() {
  console.log('\n=== Fixing Invalid Conversion Factors ===\n');

  const { data: configs } = await supabase
    .from('item_pack_configurations')
    .select('*');

  let fixed = 0;
  let alreadyCorrect = 0;

  for (const config of configs || []) {
    const expectedConversion = config.units_per_pack * config.unit_size;
    const diff = Math.abs(config.conversion_factor - expectedConversion);

    if (diff > 0.01) {
      // Fix the conversion factor
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({ conversion_factor: expectedConversion })
        .eq('id', config.id);

      if (!error) {
        fixed++;
        if (fixed <= 10) {
          console.log(`Fixed: ${config.id.substring(0, 8)} | ${config.conversion_factor} → ${expectedConversion}`);
        }
      }
    } else {
      alreadyCorrect++;
    }
  }

  console.log(`\n✓ Fixed: ${fixed}`);
  console.log(`✓ Already Correct: ${alreadyCorrect}`);
  console.log(`✓ Total: ${configs?.length || 0}`);
}

fixConversionFactors().catch(console.error);
