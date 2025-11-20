import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    const { data, error } = await supabase
      .from("proforma_cogs_assumptions")
      .upsert(
        {
          scenario_id: body.scenario_id,
          food_cogs_pct: body.food_cogs_pct,
          bev_cogs_pct: body.bev_cogs_pct,
          other_cogs_pct: body.other_cogs_pct,
        },
        { onConflict: "scenario_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving COGS assumptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
