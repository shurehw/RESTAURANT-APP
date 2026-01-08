import { createClient } from "@/utils/supabase/server";
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

  const { scenario_id, center_name, seats, sort_order = 0 } = body;

  if (!scenario_id || !center_name || !seats) {
    return NextResponse.json(
      { error: "scenario_id, center_name, and seats are required" },
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

  const { id, center_name, seats } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updateData: any = {};
  if (center_name !== undefined) updateData.center_name = center_name;
  if (seats !== undefined) updateData.seats = seats;
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
