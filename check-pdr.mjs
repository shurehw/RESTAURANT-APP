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

async function main() {
  // Get PDR center
  const { data: pdrCenters, error: pdrError } = await supabase
    .from('proforma_revenue_centers')
    .select('*')
    .eq('is_pdr', true);

  if (pdrError) {
    console.log('Error finding PDR:', pdrError);
    return;
  }

  console.log('PDR Centers found:', pdrCenters?.length || 0);
  if (!pdrCenters || pdrCenters.length === 0) {
    console.log('No PDR centers found!');
    return;
  }

  const pdrCenter = pdrCenters[0];
  console.log('\nPDR Center:', {
    id: pdrCenter.id,
    center_name: pdrCenter.center_name,
    seats: pdrCenter.seats,
    is_pdr: pdrCenter.is_pdr,
    max_seats: pdrCenter.max_seats
  });

  // Get all participation records for PDR
  const { data: participation } = await supabase
    .from('proforma_center_service_participation')
    .select('*, service_period:proforma_revenue_service_periods(service_name)')
    .eq('revenue_center_id', pdrCenter.id);

  console.log('\nPDR Participation Records (' + (participation?.length || 0) + '):');
  participation?.forEach(p => {
    console.log('  ' + p.service_period.service_name + ':');
    console.log('    is_active:', p.is_active);
    console.log('    pdr_covers:', p.pdr_covers);
    console.log('    events_per_service:', p.events_per_service);
    console.log('    avg_guests_per_event:', p.avg_guests_per_event);
  });

  // Check service_period_covers for PDR
  const { data: covers } = await supabase
    .from('proforma_service_period_covers')
    .select('*, service_period:proforma_revenue_service_periods(service_name)')
    .eq('revenue_center_id', pdrCenter.id);

  console.log('\nPDR Service Period Covers:');
  if (covers && covers.length > 0) {
    covers.forEach(c => {
      console.log('  ' + c.service_period.service_name + ': ' + c.covers_per_service + ' covers');
    });
  } else {
    console.log('  None found (this is normal - PDR uses pdr_covers field in participation table)');
  }
}

main();
