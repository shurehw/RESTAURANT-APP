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
      .from("proforma_capex_assumptions")
      .upsert(
        {
          scenario_id: body.scenario_id,
          total_capex: body.total_capex,
          equity_pct: body.equity_pct,
          debt_interest_rate: body.debt_interest_rate,
          debt_term_months: body.debt_term_months,
          interest_only_months: body.interest_only_months,
        },
        { onConflict: "scenario_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving capex assumptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
