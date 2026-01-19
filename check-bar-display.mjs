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

// Get the participation API response (what the frontend sees)
const scenarioId = '611118a8-2a9d-49c9-817f-b7ae558a34c9';

const { data, error } = await supabase
  .from('proforma_center_service_participation')
  .select(`
    *,
    revenue_center:proforma_revenue_centers(center_name, bar_mode, is_bar),
    service_period:proforma_revenue_service_periods(service_name)
  `)
  .eq('service_period.scenario_id', scenarioId);

console.log('API Response (what frontend sees):');
data?.forEach(p => {
  if (p.revenue_center.is_bar) {
    console.log(`\n${p.revenue_center.center_name} × ${p.service_period.service_name}:`);
    console.log(`  Center default bar_mode: ${p.revenue_center.bar_mode}`);
    console.log(`  bar_mode_override: ${p.bar_mode_override}`);
    console.log(`  Effective mode: ${p.bar_mode_override || p.revenue_center.bar_mode}`);
    console.log(`  is_active: ${p.is_active}`);
  }
});
