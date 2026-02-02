import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use service role for ops scripts
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPackConfigs() {
  console.log('Fetching pack configurations...\n');

  const { data: packConfigs, error } = await supabase
    .from('item_pack_configurations')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Error fetching pack configs:', error);
    return;
  }

  console.log(`Found ${packConfigs?.length || 0} pack configs (showing first 10)`);
  console.log(JSON.stringify(packConfigs, null, 2));
}

verifyPackConfigs();
