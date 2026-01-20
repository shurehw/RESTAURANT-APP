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
    console.log('Creating project with body:', JSON.stringify(body, null, 2));

    const {
      org_id,
      name,
      concept_type,
      density_benchmark,
      location_city,
      location_state,
      total_sf,
      sf_per_seat,
      dining_area_pct,
      boh_pct,
      monthly_rent,
      use_manual_seats,
      manual_seats,
      use_manual_splits,
      square_feet_foh,
      square_feet_boh,
      bar_seats,
      // FP&A Standing Capacity fields
      concept_archetype,
      bar_zone_pct,
      bar_net_to_gross,
      standable_pct,
      sf_per_standing_guest,
      utilization_factor,
      code_sf_per_person,
    } = body;

    // Create project
    const { data: project, error: projectError } = await supabase
      .from("proforma_projects")
      .insert({
        org_id,
        name,
        concept_type,
        density_benchmark,
        location_city,
        location_state,
        total_sf,
        sf_per_seat,
        dining_area_pct,
        boh_pct,
        monthly_rent,
        use_manual_seats,
        manual_seats,
        use_manual_splits,
        square_feet_foh,
        square_feet_boh,
        bar_seats,
        // FP&A Standing Capacity fields
        concept_archetype,
        bar_zone_pct,
        bar_net_to_gross,
        standable_pct,
        sf_per_standing_guest,
        utilization_factor,
        code_sf_per_person,
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

    // Auto-create default revenue centers (Dining Room and Bar)
    console.log('Creating default revenue centers...');
    const calculatedSeats = manual_seats || Math.floor(total_sf * (dining_area_pct / 100) / (sf_per_seat || 15));

    const { error: revCenterError } = await supabase
      .from("revenue_centers")
      .insert([
        {
          project_id: project.id,
          name: "Dining Room",
          is_primary: true,
          total_seats: calculatedSeats,
          display_order: 1
        },
        {
          project_id: project.id,
          name: "Bar",
          is_primary: false,
          total_seats: bar_seats || 0,
          display_order: 2
        }
      ]);

    if (revCenterError) {
      console.error("Warning: Could not create revenue centers:", revCenterError);
      // Don't fail the whole request, revenue centers can be added later
    }

    // Auto-create default service periods (Lunch and Dinner)
    console.log('Creating default service periods...');
    const { error: servicePeriodError } = await supabase
      .from("service_periods")
      .insert([
        {
          project_id: project.id,
          name: "Lunch",
          days_per_week: 7,
          turns_per_day: 1.5,
          avg_check: 35,
          display_order: 1
        },
        {
          project_id: project.id,
          name: "Dinner",
          days_per_week: 7,
          turns_per_day: 2,
          avg_check: 75,
          display_order: 2
        }
      ]);

    if (servicePeriodError) {
      console.error("Warning: Could not create service periods:", servicePeriodError);
      // Don't fail the whole request, service periods can be added later
    }

    console.log('✓ Project created with default revenue centers and service periods');

    return NextResponse.json({ project, scenario });
  } catch (error) {
    console.error("Error in POST /api/proforma/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const body = await request.json();
    console.log('Updating project with body:', JSON.stringify(body, null, 2));

    const {
      name,
      concept_type,
      density_benchmark,
      location_city,
      location_state,
      total_sf,
      sf_per_seat,
      dining_area_pct,
      boh_pct,
      monthly_rent,
      use_manual_seats,
      manual_seats,
      use_manual_splits,
      square_feet_foh,
      square_feet_boh,
      bar_seats,
      // FP&A Standing Capacity fields
      concept_archetype,
      bar_zone_pct,
      bar_net_to_gross,
      standable_pct,
      sf_per_standing_guest,
      utilization_factor,
      code_sf_per_person,
    } = body;

    // Update project
    const { data: project, error: projectError } = await supabase
      .from("proforma_projects")
      .update({
        name,
        concept_type,
        density_benchmark,
        location_city,
        location_state,
        total_sf,
        sf_per_seat,
        dining_area_pct,
        boh_pct,
        monthly_rent,
        use_manual_seats,
        manual_seats,
        use_manual_splits,
        square_feet_foh,
        square_feet_boh,
        bar_seats,
        // FP&A Standing Capacity fields
        concept_archetype,
        bar_zone_pct,
        bar_net_to_gross,
        standable_pct,
        sf_per_standing_guest,
        utilization_factor,
        code_sf_per_person,
      })
      .eq('id', projectId)
      .select()
      .single();

    if (projectError) {
      console.error("Error updating project:", projectError);
      return NextResponse.json(
        { error: "Failed to update project", details: projectError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error in PATCH /api/proforma/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
