import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const concept = searchParams.get("concept");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!concept) {
      return NextResponse.json({ error: "Concept type required" }, { status: 400 });
    }

    // Get position mix % for this concept
    const { data, error } = await supabase
      .from("proforma_labor_position_mix")
      .select("*")
      .eq("concept_type", concept)
      .order("category", { ascending: true })
      .order("position_name", { ascending: true });

    if (error) {
      console.error("Error fetching position mix:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
