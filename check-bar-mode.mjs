import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Get bar center
const { data: barCenters } = await supabase
  .from('proforma_revenue_centers')
  .select('*')
  .eq('is_bar', true);

console.log('Bar Centers:', barCenters);

if (barCenters && barCenters.length > 0) {
  const barId = barCenters[0].id;
  
  // Get all participation for bar
  const { data: participation } = await supabase
    .from('proforma_center_service_participation')
    .select('*, service_period:proforma_revenue_service_periods(service_name)')
    .eq('revenue_center_id', barId);
  
  console.log('\nBar Participation:');
  participation?.forEach(p => {
    console.log(`  ${p.service_period.service_name}:`);
    console.log(`    is_active: ${p.is_active}`);
    console.log(`    bar_mode_override: ${p.bar_mode_override}`);
  });
}
