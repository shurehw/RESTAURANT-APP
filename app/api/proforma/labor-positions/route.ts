import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET: Fetch labor positions for a scenario
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenario_id");
    const driverTypes = searchParams.get("driver_types")?.split(",");

    if (!scenarioId) {
      return NextResponse.json(
        { error: "Missing scenario_id" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("proforma_labor_positions")
      .select("*")
      .eq("scenario_id", scenarioId)
      .eq("is_active", true)
      .order("position_name");

    // Filter by driver types if specified
    if (driverTypes && driverTypes.length > 0) {
      query = query.in("labor_driver_type", driverTypes);
    }

    const { data: positions, error } = await query;

    if (error) {
      console.error("Error fetching positions:", error);
      return NextResponse.json(
        { error: "Failed to fetch positions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ positions: positions || [] });
  } catch (error) {
    console.error("Error in GET /api/proforma/labor-positions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Add new position to scenario
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      scenario_id,
      position_name,
      category,
      labor_driver_type,
      hours_per_100_covers,
      position_mix_pct,
      hourly_rate,
      staff_per_service,
      hours_per_shift,
      cover_threshold,
    } = body;

    const { data, error } = await supabase
      .from("proforma_labor_positions")
      .insert({
        scenario_id,
        position_name,
        category,
        labor_driver_type,
        hours_per_100_covers,
        position_mix_pct,
        hourly_rate,
        staff_per_service,
        hours_per_shift,
        cover_threshold,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating position:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Update existing position
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    const { data, error } = await supabase
      .from("proforma_labor_positions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating position:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove position
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Position ID required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("proforma_labor_positions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting position:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
