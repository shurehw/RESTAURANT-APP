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

    const { data: services, error } = await supabase
      .from("proforma_revenue_service_periods")
      .select("*")
      .eq("scenario_id", scenario_id)
      .order("sort_order");

    if (error) {
      console.error("Error loading service periods:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ servicePeriods: services });
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
      scenario_id,
      service_name,
      days_per_week,
      avg_covers_per_service,
      avg_check,
      food_pct,
      bev_pct,
      other_pct,
      sort_order,
      operating_days,
      day_of_week_distribution,
    } = body;

    // Calculate avg_food_check and avg_bev_check from avg_check and percentages
    const foodPct = food_pct ?? 60;
    const bevPct = bev_pct ?? 35;
    const otherPct = other_pct ?? 5;
    const avgCheckVal = avg_check ?? 0;
    const coversVal = avg_covers_per_service ?? 0;

    const avg_food_check = avgCheckVal * (foodPct / 100);
    const avg_bev_check = avgCheckVal * (bevPct / 100);

    const { data, error } = await supabase
      .from("proforma_revenue_service_periods")
      .insert({
        scenario_id,
        service_name,
        days_per_week,
        avg_covers_per_service: coversVal,
        avg_check: avgCheckVal,
        avg_food_check,
        avg_bev_check,
        food_pct: foodPct,
        bev_pct: bevPct,
        other_pct: otherPct,
        sort_order: sort_order ?? 0,
        operating_days: operating_days ?? [0, 1, 2, 3, 4, 5, 6],
        day_of_week_distribution: day_of_week_distribution ?? [14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2],
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating service period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ service: data });
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
      id,
      service_name,
      days_per_week,
      avg_covers_per_service,
      avg_check,
      food_pct,
      bev_pct,
      other_pct,
      operating_days,
      day_of_week_distribution,
      service_hours,
      avg_dining_time_hours,
      default_utilization_pct,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updateData: any = {};
    if (service_name !== undefined) updateData.service_name = service_name;
    if (days_per_week !== undefined) updateData.days_per_week = days_per_week;
    if (avg_covers_per_service !== undefined) updateData.avg_covers_per_service = avg_covers_per_service;
    if (avg_check !== undefined) updateData.avg_check = avg_check;
    if (food_pct !== undefined) updateData.food_pct = food_pct;
    if (bev_pct !== undefined) updateData.bev_pct = bev_pct;
    if (other_pct !== undefined) updateData.other_pct = other_pct;
    if (operating_days !== undefined) updateData.operating_days = operating_days;
    if (day_of_week_distribution !== undefined) updateData.day_of_week_distribution = day_of_week_distribution;
    if (service_hours !== undefined) updateData.service_hours = service_hours;
    if (avg_dining_time_hours !== undefined) updateData.avg_dining_time_hours = avg_dining_time_hours;
    if (default_utilization_pct !== undefined) updateData.default_utilization_pct = default_utilization_pct;

    const { data, error } = await supabase
      .from("proforma_revenue_service_periods")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating service period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ service: data });
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
      .from("proforma_revenue_service_periods")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting service period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
