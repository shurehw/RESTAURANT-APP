import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenario_id");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!scenarioId) {
      return NextResponse.json(
        { error: "scenario_id required" },
        { status: 400 }
      );
    }

    // Get adjustments for this scenario
    const { data: adjustments, error } = await supabase
      .from("proforma_scenario_adjustments")
      .select("*")
      .eq("scenario_id", scenarioId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is OK
      console.error("Error fetching adjustments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adjustments: adjustments || null });
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
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      scenario_id,
      base_scenario_id,
      covers_multiplier,
      check_avg_offset,
      revenue_multiplier,
      food_cogs_pct_override,
      bev_cogs_pct_override,
      other_cogs_pct_override,
      wage_rate_offset,
      efficiency_multiplier,
      rent_monthly_override,
      utilities_multiplier,
      marketing_multiplier,
      description,
    } = body;

    if (!scenario_id || !base_scenario_id) {
      return NextResponse.json(
        { error: "scenario_id and base_scenario_id required" },
        { status: 400 }
      );
    }

    // Create adjustments
    const { data: adjustments, error } = await supabase
      .from("proforma_scenario_adjustments")
      .insert({
        scenario_id,
        base_scenario_id,
        covers_multiplier,
        check_avg_offset,
        revenue_multiplier,
        food_cogs_pct_override,
        bev_cogs_pct_override,
        other_cogs_pct_override,
        wage_rate_offset,
        efficiency_multiplier,
        rent_monthly_override,
        utilities_multiplier,
        marketing_multiplier,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating adjustments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
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
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { scenario_id, ...updates } = body;

    if (!scenario_id) {
      return NextResponse.json(
        { error: "scenario_id required" },
        { status: 400 }
      );
    }

    // Update adjustments
    const { data: adjustments, error } = await supabase
      .from("proforma_scenario_adjustments")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("scenario_id", scenario_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating adjustments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenario_id");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!scenarioId) {
      return NextResponse.json(
        { error: "scenario_id required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("proforma_scenario_adjustments")
      .delete()
      .eq("scenario_id", scenarioId);

    if (error) {
      console.error("Error deleting adjustments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
