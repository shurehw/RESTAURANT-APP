import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
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
      org_id,
      name,
      concept_type,
      location_city,
      location_state,
      square_feet_foh,
      square_feet_boh,
      seats,
      bar_seats,
    } = body;

    // Create project
    const { data: project, error: projectError } = await supabase
      .from("proforma_projects")
      .insert({
        org_id,
        name,
        concept_type,
        location_city,
        location_state,
        square_feet_foh,
        square_feet_boh,
        seats,
        bar_seats,
      })
      .select()
      .single();

    if (projectError) {
      console.error("Error creating project:", projectError);
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      );
    }

    // Create a default "Base" scenario
    const startMonth = new Date();
    startMonth.setDate(1); // First of current month

    const { data: scenario, error: scenarioError } = await supabase
      .from("proforma_scenarios")
      .insert({
        project_id: project.id,
        name: "Base",
        is_base: true,
        months: 60,
        start_month: startMonth.toISOString().split("T")[0],
      })
      .select()
      .single();

    if (scenarioError) {
      console.error("Error creating scenario:", scenarioError);
      return NextResponse.json(
        { error: "Failed to create scenario" },
        { status: 500 }
      );
    }

    return NextResponse.json({ project, scenario });
  } catch (error) {
    console.error("Error in POST /api/proforma/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
