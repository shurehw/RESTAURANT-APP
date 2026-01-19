import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const barId = '7457cff6-ed1c-42b7-ab7a-3421a7f7549c';
const lunchId = '4035d7be-bf2e-4a7a-a40a-9c1c2e6eb282';

// Get service details
const { data: service } = await supabase
  .from('proforma_revenue_service_periods')
  .select('*')
  .eq('id', lunchId)
  .single();

const { data: center } = await supabase
  .from('proforma_revenue_centers')
  .select('*')
  .eq('id', barId)
  .single();

console.log('Lunch service hours:', service.service_hours);
console.log('Avg dining time:', service.avg_dining_time_hours);
console.log('Bar seats:', center.seats);

// Calculate covers
const turns = service.service_hours / service.avg_dining_time_hours;
const utilization = 0.65;
const covers = center.seats * turns * utilization;

console.log('\nCalculation:', center.seats, 'seats ×', turns.toFixed(2), 'turns ×', utilization, 'util =', covers.toFixed(1), 'covers');

// Insert cover record
const { data, error } = await supabase
  .from('proforma_service_period_covers')
  .upsert({
    service_period_id: lunchId,
    revenue_center_id: barId,
    covers_per_service: Math.round(covers * 10) / 10,
    is_manually_edited: false,
  }, {
    onConflict: 'service_period_id,revenue_center_id',
  })
  .select()
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('\n✅ Cover record created!');
  console.log('Covers per service:', data.covers_per_service);
}
