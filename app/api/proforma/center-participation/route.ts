import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: Fetch participation matrix for a scenario
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

    // Get all centers and service periods for this scenario
    const { data: centers, error: centersError } = await supabase
      .from('proforma_revenue_centers')
      .select('*')
      .eq('scenario_id', scenario_id)
      .order('sort_order');

    const { data: services, error: servicesError } = await supabase
      .from('proforma_revenue_service_periods')
      .select('*')
      .eq('scenario_id', scenario_id)
      .order('sort_order');

    if (centersError || servicesError) {
      console.error('Error fetching data:', centersError || servicesError);
      return NextResponse.json(
        { error: 'Failed to fetch data' },
        { status: 500 }
      );
    }

    // Get all participation records
    const { data: participation, error: participationError } = await supabase
      .from('proforma_center_service_participation')
      .select('*')
      .in('revenue_center_id', centers?.map(c => c.id) || [])
      .in('service_period_id', services?.map(s => s.id) || []);

    if (participationError) {
      console.error('Error fetching participation:', participationError);
      return NextResponse.json(
        { error: 'Failed to fetch participation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      centers: centers || [],
      services: services || [],
      participation: participation || [],
    });

  } catch (error) {
    console.error('Error in center-participation GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update participation for a center × service
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { revenue_center_id, service_period_id, is_active, default_utilization_pct, notes } = body;

    if (!revenue_center_id || !service_period_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Upsert participation record
    const { data, error } = await supabase
      .from('proforma_center_service_participation')
      .upsert({
        revenue_center_id,
        service_period_id,
        is_active: is_active ?? false,
        default_utilization_pct: default_utilization_pct ?? 65.0,
        notes: notes || null,
      }, {
        onConflict: 'revenue_center_id,service_period_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating participation:', error);
      return NextResponse.json(
        { error: 'Failed to update participation', details: error.message },
        { status: 500 }
      );
    }

    // If deactivating, clear any covers for this center × service
    if (is_active === false) {
      const { error: clearError } = await supabase
        .from('proforma_service_period_covers')
        .delete()
        .eq('revenue_center_id', revenue_center_id)
        .eq('service_period_id', service_period_id);

      if (clearError) {
        console.error('Error clearing covers:', clearError);
        // Don't fail the request, just log the error
      }
    }

    // If activating, auto-calculate covers for regular dining centers
    if (is_active === true) {
      // Get center and service details
      const [centerRes, serviceRes] = await Promise.all([
        supabase.from('proforma_revenue_centers').select('*').eq('id', revenue_center_id).single(),
        supabase.from('proforma_revenue_service_periods').select('*').eq('id', service_period_id).single()
      ]);

      const center = centerRes.data;
      const service = serviceRes.data;

      // Auto-calculate covers for regular dining centers and SEATED bars (not PDRs or standing bars)
      if (center && service && !center.is_pdr) {
        // For bars, check if they're in seated mode
        const isSeatedBar = center.is_bar && center.bar_mode === 'seated';
        const shouldCalculate = !center.is_bar || isSeatedBar;

        if (shouldCalculate) {
          const turns = service.service_hours / service.avg_dining_time_hours;
          const utilization = (default_utilization_pct ?? 70.0) / 100; // Default 70% for bars
          const covers = center.seats * turns * utilization;

          // Upsert the cover record
          const { error: coverError } = await supabase
            .from('proforma_service_period_covers')
            .upsert({
              service_period_id,
              revenue_center_id,
              covers_per_service: Math.round(covers),
              is_manually_edited: false,
            }, {
              onConflict: 'service_period_id,revenue_center_id',
            });

          if (coverError) {
            console.error('Error auto-calculating covers:', coverError);
            // Don't fail the request, just log the error
          }
        }
      }
    }

    return NextResponse.json({ participation: data });

  } catch (error) {
    console.error('Error in center-participation PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Bulk initialize participation for new center or service
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { scenario_id, revenue_center_id, service_period_id, default_active } = body;

    if (!scenario_id) {
      return NextResponse.json(
        { error: 'Missing scenario_id' },
        { status: 400 }
      );
    }

    let participationRecords = [];

    if (revenue_center_id) {
      // New center added - create participation for all services
      const { data: services } = await supabase
        .from('proforma_revenue_service_periods')
        .select('id')
        .eq('scenario_id', scenario_id);

      participationRecords = (services || []).map(s => ({
        revenue_center_id,
        service_period_id: s.id,
        is_active: default_active ?? true, // Default to active
      }));
    } else if (service_period_id) {
      // New service added - create participation for all centers
      const { data: centers } = await supabase
        .from('proforma_revenue_centers')
        .select('id')
        .eq('scenario_id', scenario_id);

      participationRecords = (centers || []).map(c => ({
        revenue_center_id: c.id,
        service_period_id,
        is_active: default_active ?? true,
      }));
    } else {
      return NextResponse.json(
        { error: 'Must provide either revenue_center_id or service_period_id' },
        { status: 400 }
      );
    }

    if (participationRecords.length === 0) {
      return NextResponse.json({ message: 'No participation records to create' });
    }

    const { error } = await supabase
      .from('proforma_center_service_participation')
      .upsert(participationRecords, {
        onConflict: 'revenue_center_id,service_period_id',
        ignoreDuplicates: true,
      });

    if (error) {
      console.error('Error creating participation records:', error);
      return NextResponse.json(
        { error: 'Failed to create participation records', details: error.message },
        { status: 500 }
      );
    }

    // Auto-calculate covers for newly activated centers (if default_active is true)
    if (default_active === true) {
      // Get all centers and services for this scenario
      const [centersRes, servicesRes] = await Promise.all([
        supabase.from('proforma_revenue_centers').select('*').eq('scenario_id', scenario_id),
        supabase.from('proforma_revenue_service_periods').select('*').eq('scenario_id', scenario_id)
      ]);

      const centers = centersRes.data || [];
      const services = servicesRes.data || [];

      // Calculate covers for each participation record
      const coverRecords = [];
      for (const partRec of participationRecords) {
        const center = centers.find(c => c.id === partRec.revenue_center_id);
        const service = services.find(s => s.id === partRec.service_period_id);

        // Only for regular dining centers
        if (center && service && !center.is_bar && !center.is_pdr) {
          const turns = service.service_hours / service.avg_dining_time_hours;
          const utilization = 0.65; // Default 65%
          const covers = center.seats * turns * utilization;

          coverRecords.push({
            service_period_id: partRec.service_period_id,
            revenue_center_id: partRec.revenue_center_id,
            covers_per_service: Math.round(covers * 10) / 10,
            is_manually_edited: false,
          });
        }
      }

      if (coverRecords.length > 0) {
        const { error: coverError } = await supabase
          .from('proforma_service_period_covers')
          .upsert(coverRecords, {
            onConflict: 'service_period_id,revenue_center_id',
          });

        if (coverError) {
          console.error('Error auto-calculating covers in bulk:', coverError);
          // Don't fail the request, just log
        }
      }
    }

    return NextResponse.json({
      message: 'Participation records created',
      count: participationRecords.length,
    });

  } catch (error) {
    console.error('Error in center-participation POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
