import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  if (!scenarioId) {
    return NextResponse.json({ error: "scenario_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("proforma_revenue_centers")
    .select("*")
    .eq("scenario_id", scenarioId)
    .order("sort_order");

  if (error) {
    console.error("Error fetching revenue centers:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ centers: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const {
    scenario_id,
    center_name,
    seats,
    sort_order = 0,
    is_bar = false,
    bar_mode = 'none',
    bar_zone_area_sqft,
    bar_zone_depth_ft,
    is_pdr = false,
    max_seats
  } = body;

  if (!scenario_id || !center_name || !seats) {
    return NextResponse.json(
      { error: "scenario_id, center_name, and seats are required" },
      { status: 400 }
    );
  }

  // Validate bar mode
  if (is_bar && bar_mode === 'none') {
    return NextResponse.json(
      { error: "Bar mode must be 'seated' or 'standing' when is_bar is true" },
      { status: 400 }
    );
  }

  // Validate: cannot be both bar and PDR
  if (is_bar && is_pdr) {
    return NextResponse.json(
      { error: "A center cannot be both a bar and a PDR" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("proforma_revenue_centers")
    .insert({
      scenario_id,
      center_name,
      seats,
      sort_order,
      is_bar,
      bar_mode,
      bar_zone_area_sqft: bar_zone_area_sqft || null,
      bar_zone_depth_ft: bar_zone_depth_ft || null,
      is_pdr,
      max_seats: max_seats || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating revenue center:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ center: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { id, center_name, seats, is_bar, bar_mode, bar_zone_area_sqft, bar_zone_depth_ft, is_pdr, max_seats } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Validate bar mode if being updated
  if (is_bar !== undefined && is_bar && bar_mode === 'none') {
    return NextResponse.json(
      { error: "Bar mode must be 'seated' or 'standing' when is_bar is true" },
      { status: 400 }
    );
  }

  // Validate: cannot be both bar and PDR
  if (is_bar && is_pdr) {
    return NextResponse.json(
      { error: "A center cannot be both a bar and a PDR" },
      { status: 400 }
    );
  }

  const updateData: any = {};
  if (center_name !== undefined) updateData.center_name = center_name;
  if (seats !== undefined) updateData.seats = seats;
  if (is_bar !== undefined) updateData.is_bar = is_bar;
  if (bar_mode !== undefined) updateData.bar_mode = bar_mode;
  if (bar_zone_area_sqft !== undefined) updateData.bar_zone_area_sqft = bar_zone_area_sqft;
  if (bar_zone_depth_ft !== undefined) updateData.bar_zone_depth_ft = bar_zone_depth_ft;
  if (is_pdr !== undefined) updateData.is_pdr = is_pdr;
  if (max_seats !== undefined) updateData.max_seats = max_seats;
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("proforma_revenue_centers")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating revenue center:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ center: data });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("proforma_revenue_centers")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting revenue center:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
