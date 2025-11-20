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

    // Upsert preopening assumptions
    const { data, error } = await supabase
      .from("proforma_preopening_assumptions")
      .upsert(
        {
          scenario_id: body.scenario_id,
          duration_months: body.duration_months,

          // Capital & Expense Totals
          total_construction: body.total_construction,
          total_ffne: body.total_ffne,
          total_initial_inventory_fnb: body.total_initial_inventory_fnb,
          total_initial_inventory_other: body.total_initial_inventory_other,
          total_preopening_payroll_fixed: body.total_preopening_payroll_fixed,
          total_preopening_payroll_variable: body.total_preopening_payroll_variable,
          total_preopening_payroll_taxes: body.total_preopening_payroll_taxes,
          total_preopening_opex_operating: body.total_preopening_opex_operating,
          total_preopening_opex_occupancy: body.total_preopening_opex_occupancy,
          total_preopening_opex_gna: body.total_preopening_opex_gna,
          total_preopening_marketing: body.total_preopening_marketing,
          total_preopening_training: body.total_preopening_training,
          total_preopening_opening_order: body.total_preopening_opening_order,
          total_preopening_kitchen_bar: body.total_preopening_kitchen_bar,
          total_working_capital: body.total_working_capital,
          total_contingency: body.total_contingency,
          total_preopening_management_fees: body.total_preopening_management_fees,

          // Distribution patterns
          construction_distribution: body.construction_distribution,
          ffne_distribution: body.ffne_distribution,
          payroll_fixed_distribution: body.payroll_fixed_distribution,
          payroll_variable_distribution: body.payroll_variable_distribution,
          marketing_distribution: body.marketing_distribution,
          inventory_distribution: body.inventory_distribution,

          // Custom distributions
          custom_distributions: body.custom_distributions,
        },
        { onConflict: "scenario_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving preopening assumptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
