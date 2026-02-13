import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: Calculate total annual revenue and covers from service period covers
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenario_id = searchParams.get('scenario_id');

    if (!scenario_id) {
      return NextResponse.json(
        { error: 'Missing scenario_id' },
        { status: 400 }
      );
    }

    // Get all service periods for this scenario
    const { data: servicePeriods, error: serviceError } = await supabase
      .from('proforma_revenue_service_periods')
      .select('id, service_name, operating_days')
      .eq('scenario_id', scenario_id);

    if (serviceError) {
      console.error('Error fetching service periods:', serviceError);
      console.error('Service error details:', JSON.stringify(serviceError));
      // Return empty data instead of hard error for better UX
      return NextResponse.json({
        annual_revenue: 0,
        annual_covers: 0,
        message: 'Revenue data not available yet. Please complete Revenue assumptions first.'
      });
    }

    if (!servicePeriods || servicePeriods.length === 0) {
      return NextResponse.json({
        annual_revenue: 0,
        annual_covers: 0,
        message: 'No service periods configured yet'
      });
    }

    // Get all revenue centers for this scenario
    const { data: centers, error: centersError } = await supabase
      .from('proforma_revenue_centers')
      .select('id, center_name, is_pdr, is_bar')
      .eq('scenario_id', scenario_id);

    if (centersError) {
      console.error('Error fetching centers:', centersError);
      return NextResponse.json({
        annual_revenue: 0,
        annual_covers: 0,
        message: 'Revenue centers not configured yet'
      });
    }

    if (!centers || centers.length === 0) {
      return NextResponse.json({
        annual_revenue: 0,
        annual_covers: 0,
        message: 'No revenue centers configured yet'
      });
    }

    // Get all service period covers
    const { data: covers, error: coversError } = await supabase
      .from('proforma_service_period_covers')
      .select('*')
      .in('revenue_center_id', centers.map(c => c.id))
      .in('service_period_id', servicePeriods.map(s => s.id));

    if (coversError) {
      console.error('Error fetching covers:', coversError);
    }

    // Get center service metrics for avg_check, bar revenue, and PDR revenue
    const { data: metrics, error: metricsError } = await supabase
      .from('proforma_center_service_metrics')
      .select('*')
      .in('revenue_center_id', centers.map(c => c.id))
      .in('service_period_id', servicePeriods.map(s => s.id));

    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
    }

    // Calculate annual revenue and covers
    let totalAnnualRevenue = 0;
    let totalAnnualCovers = 0;

    for (const service of servicePeriods) {
      const daysPerWeek = service.operating_days?.length || 7;
      const weeksPerYear = 52;
      const servicesPerYear = daysPerWeek * weeksPerYear;

      for (const center of centers) {
        const coverRecord = covers?.find(
          c => c.revenue_center_id === center.id && c.service_period_id === service.id
        );

        const metricRecord = metrics?.find(
          m => m.revenue_center_id === center.id && m.service_period_id === service.id
        );

        if (!coverRecord && !metricRecord) continue;

        // Regular dining/seated bar: covers × avg check
        if (!center.is_pdr && !center.is_bar) {
          const coversPerService = coverRecord?.covers || 0;
          const avgCheck = metricRecord?.avg_check || 50; // Default if not set
          if (coversPerService > 0 && avgCheck > 0) {
            const revenue = coversPerService * avgCheck * servicesPerYear;
            totalAnnualRevenue += revenue;
            totalAnnualCovers += coversPerService * servicesPerYear;
          }
        }

        // Standing bar: bar_guests × avg_spend_per_guest
        else if (center.is_bar && metricRecord?.bar_guests) {
          const barGuests = metricRecord.bar_guests || 0;
          const avgSpend = metricRecord.avg_spend_per_guest || metricRecord.bar_avg_check || 0;
          if (barGuests > 0 && avgSpend > 0) {
            const revenue = barGuests * avgSpend * servicesPerYear;
            totalAnnualRevenue += revenue;
          }
        }

        // PDR: pdr_revenue (already calculated)
        else if (center.is_pdr && metricRecord?.pdr_revenue) {
          const pdrRevenuePerService = metricRecord.pdr_revenue || 0;
          if (pdrRevenuePerService > 0) {
            totalAnnualRevenue += pdrRevenuePerService * servicesPerYear;
            if (metricRecord.pdr_covers) {
              totalAnnualCovers += metricRecord.pdr_covers * servicesPerYear;
            }
          }
        }
      }
    }

    return NextResponse.json({
      annual_revenue: Math.round(totalAnnualRevenue),
      annual_covers: Math.round(totalAnnualCovers),
      service_periods_count: servicePeriods.length,
      centers_count: centers.length,
      has_data: totalAnnualRevenue > 0 || totalAnnualCovers > 0
    });
  } catch (error) {
    console.error('Error calculating revenue summary:', error);
    return NextResponse.json({
      annual_revenue: 0,
      annual_covers: 0,
      message: 'Error calculating revenue'
    });
  }
}
