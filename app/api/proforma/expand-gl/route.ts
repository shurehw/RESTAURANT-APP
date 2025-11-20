import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { scenario_id } = body;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete existing GL results for this scenario
    await supabase
      .from("proforma_monthly_gl")
      .delete()
      .eq("scenario_id", scenario_id);

    // Expand categories to GL accounts using allocation map
    // This SQL does the heavy lifting: for each category result,
    // allocate to all mapped GL accounts using their weights
    const { error } = await supabase.rpc("expand_proforma_to_gl", {
      p_scenario_id: scenario_id,
    });

    if (error) {
      // If RPC doesn't exist, do it manually
      console.warn("RPC expand_proforma_to_gl not found, using manual approach");

      // Fetch all category data for this scenario
      const { data: categories } = await supabase
        .from("proforma_monthly_categories")
        .select("*")
        .eq("scenario_id", scenario_id);

      if (!categories || categories.length === 0) {
        return NextResponse.json(
          { error: "No category data found. Run calculation first." },
          { status: 400 }
        );
      }

      // For each category row, find GL mappings and insert
      for (const cat of categories) {
        const { data: mappings } = await supabase
          .from("gl_account_category_map")
          .select("gl_account_id, weight")
          .eq("category_id", cat.category_id);

        if (mappings) {
          for (const mapping of mappings) {
            const allocatedAmount = cat.amount * (mapping.weight / 100.0);

            await supabase.from("proforma_monthly_gl").insert({
              scenario_id: cat.scenario_id,
              month_index: cat.month_index,
              period_start_date: cat.period_start_date,
              gl_account_id: mapping.gl_account_id,
              amount: allocatedAmount,
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "GL expansion completed",
    });
  } catch (error: any) {
    console.error("Error expanding GL:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
