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

    // Upsert revenue assumptions
    const { data, error } = await supabase
      .from("proforma_revenue_assumptions")
      .upsert(
        {
          scenario_id: body.scenario_id,
          days_open_per_week: body.days_open_per_week,
          services_per_day: body.services_per_day,

          // Covers per daypart
          avg_covers_lunch: body.avg_covers_lunch,
          avg_covers_dinner: body.avg_covers_dinner,
          avg_covers_late_night: body.avg_covers_late_night,

          // Food checks per daypart
          avg_check_food_lunch: body.avg_check_food_lunch,
          avg_check_food_dinner: body.avg_check_food_dinner,
          avg_check_food_late_night: body.avg_check_food_late_night,

          // Bev checks per daypart
          avg_check_bev_lunch: body.avg_check_bev_lunch,
          avg_check_bev_dinner: body.avg_check_bev_dinner,
          avg_check_bev_late_night: body.avg_check_bev_late_night,

          // Global fallbacks (deprecated but kept for backwards compat)
          avg_check_food: body.avg_check_food,
          avg_check_bev: body.avg_check_bev,

          food_mix_pct: body.food_mix_pct,
          bev_mix_pct: body.bev_mix_pct,
          other_mix_pct: body.other_mix_pct,
          ramp_months: body.ramp_months,

          // Seasonality
          seasonality_curve: body.seasonality_curve,
          seasonality_preset: body.seasonality_preset,
        },
        { onConflict: "scenario_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving revenue assumptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
