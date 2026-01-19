import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: Fetch all center covers for a scenario or service period
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenario_id = searchParams.get('scenario_id');
    const service_period_id = searchParams.get('service_period_id');

    if (!scenario_id && !service_period_id) {
      return NextResponse.json(
        { error: 'Missing scenario_id or service_period_id' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('proforma_service_period_covers')
      .select(`
        *,
        revenue_center:proforma_revenue_centers(id, center_name, seats),
        service_period:proforma_revenue_service_periods(id, service_name)
      `);

    if (service_period_id) {
      query = query.eq('service_period_id', service_period_id);
    } else if (scenario_id) {
      // Need to join through service periods to filter by scenario
      const { data: servicePeriods } = await supabase
        .from('proforma_revenue_service_periods')
        .select('id')
        .eq('scenario_id', scenario_id);

      const serviceIds = servicePeriods?.map(sp => sp.id) || [];
      query = query.in('service_period_id', serviceIds);
    }

    const { data: covers, error } = await query;

    if (error) {
      console.error('Error fetching covers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch covers' },
        { status: 500 }
      );
    }

    return NextResponse.json({ covers: covers || [] });

  } catch (error) {
    console.error('Error in service-period-covers GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update or insert covers for a center × service
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { id, service_period_id, revenue_center_id, covers_per_service, is_manually_edited } = body;

    // Support both id-based update and composite key upsert
    if (id) {
      // Update by id
      const { data, error } = await supabase
        .from('proforma_service_period_covers')
        .update({
          covers_per_service,
          is_manually_edited: is_manually_edited ?? true,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating covers:', error);
        return NextResponse.json(
          { error: 'Failed to update covers', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ cover: data });
    } else if (service_period_id && revenue_center_id && covers_per_service !== undefined) {
      // Upsert by composite key
      const { data, error } = await supabase
        .from('proforma_service_period_covers')
        .upsert({
          service_period_id,
          revenue_center_id,
          covers_per_service,
          is_manually_edited: is_manually_edited ?? false,
        }, {
          onConflict: 'service_period_id,revenue_center_id',
        })
        .select()
        .single();

      if (error) {
        console.error('Error upserting covers:', error);
        return NextResponse.json(
          { error: 'Failed to upsert covers', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ cover: data });
    } else {
      return NextResponse.json(
        { error: 'Missing required fields (id OR service_period_id + revenue_center_id + covers_per_service)' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error in service-period-covers PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove covers for a center × service
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('proforma_service_period_covers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting covers:', error);
      return NextResponse.json(
        { error: 'Failed to delete covers' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Covers deleted successfully' });

  } catch (error) {
    console.error('Error in service-period-covers DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
