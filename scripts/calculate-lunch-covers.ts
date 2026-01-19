/**
 * Calculate and insert service_period_covers for Lunch
 * Formula: Seats × Turns × (Utilization / 100)
 * where Turns = Service Hours / Avg Dining Time
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Fetching Lunch service period data...\n');

  // Get Lunch service period with its participation data
  const { data: services, error: serviceError } = await supabase
    .from('proforma_revenue_service_periods')
    .select('id, service_name, service_hours, avg_dining_time_hours, scenario_id')
    .eq('service_name', 'Lunch');

  if (serviceError || !services || services.length === 0) {
    console.error('Error fetching Lunch service:', serviceError);
    process.exit(1);
  }

  const lunchService = services[0];
  console.log('Lunch service:', lunchService);

  const turns = lunchService.service_hours / lunchService.avg_dining_time_hours;
  console.log(`Turns = ${lunchService.service_hours} hours / ${lunchService.avg_dining_time_hours} hours = ${turns.toFixed(2)}\n`);

  // Get active participation records for Lunch
  const { data: participation, error: partError } = await supabase
    .from('proforma_center_service_participation')
    .select(`
      id,
      revenue_center_id,
      service_period_id,
      is_active,
      utilization_pct,
      revenue_center:proforma_revenue_centers (
        id,
        center_name,
        seats,
        is_bar,
        is_pdr
      )
    `)
    .eq('service_period_id', lunchService.id)
    .eq('is_active', true);

  if (partError) {
    console.error('Error fetching participation:', partError);
    process.exit(1);
  }

  console.log(`Found ${participation?.length || 0} active centers for Lunch:\n`);

  // Calculate and upsert covers for each regular dining center
  for (const p of participation || []) {
    const center = (p.revenue_center as any);

    // Skip bar and PDR centers (they use different calculation methods)
    if (center.is_bar || center.is_pdr) {
      console.log(`⏭️  Skipping ${center.center_name} (${center.is_bar ? 'Bar' : 'PDR'}) - uses different calculation`);
      continue;
    }

    const utilization = p.utilization_pct / 100;
    const covers = center.seats * turns * utilization;

    console.log(`📊 ${center.center_name}:`);
    console.log(`   ${center.seats} seats × ${turns.toFixed(2)} turns × ${(utilization * 100).toFixed(0)}% util = ${covers.toFixed(1)} covers`);

    // Upsert using the API logic
    const { data, error } = await supabase
      .from('proforma_service_period_covers')
      .upsert({
        service_period_id: lunchService.id,
        revenue_center_id: center.id,
        covers_per_service: Math.round(covers * 10) / 10, // Round to 1 decimal
        is_manually_edited: false,
      }, {
        onConflict: 'service_period_id,revenue_center_id',
      })
      .select()
      .single();

    if (error) {
      console.error(`   ❌ Error upserting covers:`, error);
    } else {
      console.log(`   ✅ Upserted: ${data.covers_per_service} covers\n`);
    }
  }

  console.log('\n✨ Done! Verifying results...\n');

  // Verify
  const { data: finalCovers, error: finalError } = await supabase
    .from('proforma_service_period_covers')
    .select(`
      covers_per_service,
      revenue_center:proforma_revenue_centers (center_name),
      service_period:proforma_revenue_service_periods (service_name)
    `)
    .eq('service_period_id', lunchService.id);

  if (finalError) {
    console.error('Error verifying:', finalError);
  } else {
    console.log('Final covers for Lunch:');
    finalCovers?.forEach((c: any) => {
      console.log(`  ${c.revenue_center.center_name}: ${c.covers_per_service} covers`);
    });
  }

  const totalCovers = finalCovers?.reduce((sum: number, c: any) => sum + c.covers_per_service, 0) || 0;
  console.log(`\n📈 Total Lunch covers: ${totalCovers.toFixed(1)}\n`);
}

main().catch(console.error);
