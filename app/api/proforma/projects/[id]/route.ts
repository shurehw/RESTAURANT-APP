import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Update project
    const { data: project, error: projectError } = await supabase
      .from("proforma_projects")
      .update({
        concept_type: body.concept_type,
        density_benchmark: body.density_benchmark,
        total_sf: body.total_sf,
        sf_per_seat: body.sf_per_seat,
        dining_area_pct: body.dining_area_pct,
        boh_pct: body.boh_pct,
        monthly_rent: body.monthly_rent,
        use_manual_seats: body.use_manual_seats,
        manual_seats: body.manual_seats,
        use_manual_splits: body.use_manual_splits,
        square_feet_foh: body.square_feet_foh,
        square_feet_boh: body.square_feet_boh,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (projectError) {
      console.error("Error updating project:", projectError);
      return NextResponse.json(
        { error: "Failed to update project" },
        { status: 500 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error in PATCH /api/proforma/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
