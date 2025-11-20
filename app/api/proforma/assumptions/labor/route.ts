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
      .from("proforma_labor_assumptions")
      .upsert(
        {
          scenario_id: body.scenario_id,
          foh_hours_per_100_covers: body.foh_hours_per_100_covers,
          boh_hours_per_100_covers: body.boh_hours_per_100_covers,
          foh_hourly_rate: body.foh_hourly_rate,
          boh_hourly_rate: body.boh_hourly_rate,
          gm_salary_annual: body.gm_salary_annual,
          agm_salary_annual: body.agm_salary_annual,
          km_salary_annual: body.km_salary_annual,
          payroll_burden_pct: body.payroll_burden_pct,
        },
        { onConflict: "scenario_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving labor assumptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
