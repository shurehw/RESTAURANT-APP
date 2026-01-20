import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenarioId");
    const concept = searchParams.get("concept");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let data: any[] = [];

    // Priority 1: Try to get scenario-specific positions (if scenarioId provided)
    if (scenarioId) {
      const { data: scenarioPositions, error: scenarioError } = await supabase
        .from("proforma_labor_positions")
        .select("*")
        .eq("scenario_id", scenarioId)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("position_name", { ascending: true });

      if (!scenarioError && scenarioPositions && scenarioPositions.length > 0) {
        data = scenarioPositions;
      }
    }

    // Priority 2: Fallback to templates if no scenario positions or no scenarioId
    if (data.length === 0 && concept) {
      const { data: templatePositions, error: templateError } = await supabase
        .from("proforma_labor_position_mix")
        .select("*")
        .eq("concept_type", concept)
        .order("category", { ascending: true })
        .order("position_name", { ascending: true });

      if (templateError) {
        console.error("Error fetching position templates:", templateError);
        return NextResponse.json({ error: templateError.message }, { status: 500 });
      }

      data = templatePositions || [];
    }

    // Group by category
    const fohPositions = data?.filter((p) => p.category === "FOH") || [];
    const bohPositions = data?.filter((p) => p.category === "BOH") || [];

    return NextResponse.json({
      foh: fohPositions,
      boh: bohPositions,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
