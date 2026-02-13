import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scenario_id = searchParams.get("scenario_id");

    if (!scenario_id) {
      return NextResponse.json({ error: "scenario_id required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get all metrics for this scenario via service periods
    const { data: metrics, error } = await supabase
      .from("proforma_center_service_metrics")
      .select(`
        *,
        service_period:proforma_revenue_service_periods!inner(scenario_id)
      `)
      .eq("service_period.scenario_id", scenario_id);

    if (error) {
      console.error("Error loading center service metrics:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ metrics: metrics || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      revenue_center_id,
      service_period_id,
      covers_per_service,
      avg_check,
      food_pct,
      bev_pct,
      other_pct,
    } = body;

    const { data, error } = await supabase
      .from("proforma_center_service_metrics")
      .insert({
        revenue_center_id,
        service_period_id,
        covers_per_service: covers_per_service ?? 0,
        avg_check: avg_check ?? 0,
        food_pct: food_pct ?? 60,
        bev_pct: bev_pct ?? 35,
        other_pct: other_pct ?? 5,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating center service metric:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ metric: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      revenue_center_id,
      service_period_id,
      bar_mode_override,
      covers,
      bar_guests,
      avg_dwell_hours_seated,
      bar_utilization_pct,
      guests_per_hour,
      active_hours,
      standing_capacity,
      avg_dwell_hours,
      utilization_pct,
      covers_per_service,
      avg_check,
      food_pct,
      bev_pct,
      other_pct,
      // PDR fields
      events_per_service,
      avg_guests_per_event,
      pricing_model,
      avg_spend_per_guest,
      min_spend_per_event,
      realization_rate,
      pdr_covers,
      pdr_revenue,
    } = body;

    // Support both old (id-based) and new (center+service based) updates
    const updateData: any = {};

    // Bar mode fields
    if (bar_mode_override !== undefined) updateData.bar_mode_override = bar_mode_override;
    if (covers !== undefined) updateData.covers = covers;
    if (bar_guests !== undefined) updateData.bar_guests = bar_guests;
    if (avg_dwell_hours_seated !== undefined) updateData.avg_dwell_hours_seated = avg_dwell_hours_seated;
    if (bar_utilization_pct !== undefined) updateData.bar_utilization_pct = bar_utilization_pct;
    if (guests_per_hour !== undefined) updateData.guests_per_hour = guests_per_hour;
    if (active_hours !== undefined) updateData.active_hours = active_hours;
    if (standing_capacity !== undefined) updateData.standing_capacity = standing_capacity;
    if (avg_dwell_hours !== undefined) updateData.avg_dwell_hours = avg_dwell_hours;
    if (utilization_pct !== undefined) updateData.default_utilization_pct = utilization_pct; // Map to participation table field

    // Legacy fields
    if (covers_per_service !== undefined) updateData.covers_per_service = covers_per_service;
    if (avg_check !== undefined) updateData.avg_check = avg_check;
    if (food_pct !== undefined) updateData.food_pct = food_pct;
    if (bev_pct !== undefined) updateData.bev_pct = bev_pct;
    if (other_pct !== undefined) updateData.other_pct = other_pct;

    // PDR fields
    if (events_per_service !== undefined) updateData.events_per_service = events_per_service;
    if (avg_guests_per_event !== undefined) updateData.avg_guests_per_event = avg_guests_per_event;
    if (pricing_model !== undefined) updateData.pricing_model = pricing_model;
    if (avg_spend_per_guest !== undefined) updateData.avg_spend_per_guest = avg_spend_per_guest;
    if (min_spend_per_event !== undefined) updateData.min_spend_per_event = min_spend_per_event;
    if (realization_rate !== undefined) updateData.realization_rate = realization_rate;

    // Calculate PDR covers and revenue if we have the data
    if (events_per_service && avg_guests_per_event) {
      const calculatedCovers = events_per_service * avg_guests_per_event;
      updateData.pdr_covers = calculatedCovers;

      const realization = realization_rate || 0.90;

      if (pricing_model === 'per_guest' && avg_spend_per_guest) {
        updateData.pdr_revenue = calculatedCovers * avg_spend_per_guest * realization;
      } else if (pricing_model === 'minimum_spend' && min_spend_per_event) {
        updateData.pdr_revenue = events_per_service * min_spend_per_event * realization;
      }

      // If both pricing models provided, take max
      if (avg_spend_per_guest && min_spend_per_event) {
        const perGuestRev = calculatedCovers * avg_spend_per_guest * realization;
        const minSpendRev = events_per_service * min_spend_per_event * realization;
        updateData.pdr_revenue = Math.max(perGuestRev, minSpendRev);
      }
    }

    // Auto-calculate bar_guests when switching to standing mode
    if (bar_mode_override === 'standing' && !bar_guests && !guests_per_hour) {
      // Get center and service details for default calculation
      const [centerRes, serviceRes] = await Promise.all([
        supabase.from('proforma_revenue_centers').select('*').eq('id', revenue_center_id).single(),
        supabase.from('proforma_revenue_service_periods').select('*').eq('id', service_period_id).single()
      ]);

      const center = centerRes.data;
      const service = serviceRes.data;

      if (center && service) {
        // Default standing bar calculation
        // Assume: 60% of service hours are active, 1.0 hr dwell, 85% utilization, capacity = seats * 1.5
        const activeHours = service.service_hours * 0.6;
        const dwellHours = 1.0;
        const utilization = 0.85;
        const standingCapacity = Math.round(center.seats * 1.5); // Standing capacity ~1.5x seated
        const calculatedGuests = standingCapacity * (activeHours / dwellHours) * utilization;

        // Default bar economics
        const avgSpendPerGuest = 18.0; // $18 per guest (2-3 drinks)
        const barFoodPct = 10.0;
        const barBevPct = 90.0;

        updateData.active_hours = activeHours;
        updateData.avg_dwell_hours = dwellHours;
        updateData.standing_capacity = standingCapacity;
        updateData.bar_guests = Math.round(calculatedGuests);
        updateData.avg_spend_per_guest = avgSpendPerGuest;
        updateData.bar_food_pct = barFoodPct;
        updateData.bar_bev_pct = barBevPct;
        updateData.bar_revenue = Math.round(calculatedGuests * avgSpendPerGuest);
      }
    }

    // Calculate bar_revenue if we have bar_guests and avg_spend_per_guest
    if (bar_guests !== undefined && avg_spend_per_guest !== undefined && bar_guests > 0) {
      updateData.bar_revenue = Math.round(bar_guests * avg_spend_per_guest);
    }

    updateData.updated_at = new Date().toISOString();

    // Validation: covers and bar_guests are mutually exclusive
    if (covers != null && bar_guests != null && covers > 0 && bar_guests > 0) {
      return NextResponse.json(
        { error: "Cannot have both covers and bar_guests set" },
        { status: 400 }
      );
    }

    // Use upsert if revenue_center_id and service_period_id provided
    if (revenue_center_id && service_period_id) {
      const { data, error } = await supabase
        .from("proforma_center_service_participation")
        .upsert(
          {
            revenue_center_id,
            service_period_id,
            ...updateData,
          },
          {
            onConflict: "revenue_center_id,service_period_id",
          }
        )
        .select()
        .single();

      if (error) {
        console.error("Error upserting center-service metrics:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        return NextResponse.json({ error: error.message, details: error }, { status: 500 });
      }

      // Transform response to match frontend expectations
      const responseData = {
        ...data,
        utilization_pct: data.default_utilization_pct,
      };

      return NextResponse.json({ metrics: responseData });
    }

    return NextResponse.json({ error: "revenue_center_id and service_period_id required" }, { status: 400 });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("proforma_center_service_metrics")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting center service metric:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
