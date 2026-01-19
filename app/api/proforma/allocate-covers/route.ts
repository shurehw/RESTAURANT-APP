import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface AllocationRequest {
  service_period_id: string;
  total_covers: number;
}

interface RevenueCenter {
  id: string;
  center_name: string;
  seats: number;
  sort_order: number;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: AllocationRequest = await request.json();
    const { service_period_id, total_covers } = body;

    if (!service_period_id || total_covers === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 1. Get active centers for this service period (seat-weighted allocation)
    const { data: activeCenters, error: centersError } = await supabase
      .from('proforma_revenue_centers')
      .select(`
        id,
        center_name,
        seats,
        sort_order,
        proforma_center_service_participation!inner(is_active)
      `)
      .eq('proforma_center_service_participation.service_period_id', service_period_id)
      .eq('proforma_center_service_participation.is_active', true)
      .order('sort_order');

    if (centersError) {
      console.error('Error fetching active centers:', centersError);
      return NextResponse.json(
        { error: 'Failed to fetch active centers' },
        { status: 500 }
      );
    }

    if (!activeCenters || activeCenters.length === 0) {
      return NextResponse.json(
        { error: 'No revenue centers are active for this service period. Configure participation in Settings.' },
        { status: 400 }
      );
    }

    // 2. Calculate seat-weighted allocation
    const totalActiveSeats = activeCenters.reduce((sum, c) => sum + c.seats, 0);

    if (totalActiveSeats === 0) {
      return NextResponse.json(
        { error: 'All active centers have zero seats. Cannot allocate covers.' },
        { status: 400 }
      );
    }

    let allocations = activeCenters.map(center => {
      const allocation_pct = center.seats / totalActiveSeats;
      const allocated_covers = Math.round(total_covers * allocation_pct * 10) / 10; // Round to 1 decimal

      return {
        service_period_id,
        revenue_center_id: center.id,
        covers_per_service: allocated_covers,
        is_manually_edited: false,
      };
    });

    // 3. Distribute rounding error to first center
    const allocatedTotal = allocations.reduce((sum, a) => sum + a.covers_per_service, 0);
    const remainder = Math.round((total_covers - allocatedTotal) * 10) / 10;

    if (remainder !== 0 && allocations.length > 0) {
      allocations[0].covers_per_service += remainder;
      allocations[0].covers_per_service = Math.round(allocations[0].covers_per_service * 10) / 10;
    }

    // 4. Upsert all allocations (atomic operation)
    const { error: upsertError } = await supabase
      .from('proforma_service_period_covers')
      .upsert(allocations, {
        onConflict: 'service_period_id,revenue_center_id',
      });

    if (upsertError) {
      console.error('Error upserting cover allocations:', upsertError);
      return NextResponse.json(
        { error: 'Failed to allocate covers', details: upsertError.message },
        { status: 500 }
      );
    }

    // 5. Return the allocations
    return NextResponse.json({
      message: 'Covers allocated successfully',
      allocations,
      total_allocated: allocations.reduce((sum, a) => sum + a.covers_per_service, 0),
    });

  } catch (error) {
    console.error('Error in allocate-covers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
