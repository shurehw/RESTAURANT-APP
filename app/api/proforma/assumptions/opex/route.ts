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
      .from("proforma_occupancy_opex_assumptions")
      .upsert(
        {
          scenario_id: body.scenario_id,
          base_rent_monthly: body.base_rent_monthly,
          cam_monthly: body.cam_monthly,
          property_tax_monthly: body.property_tax_monthly,
          utilities_monthly: body.utilities_monthly,
          insurance_monthly: body.insurance_monthly,
          linen_pct_of_sales: body.linen_pct_of_sales,
          smallwares_pct_of_sales: body.smallwares_pct_of_sales,
          cleaning_supplies_pct: body.cleaning_supplies_pct,
          cc_fees_pct_of_sales: body.cc_fees_pct_of_sales,
          other_opex_flat_monthly: body.other_opex_flat_monthly,
          marketing_pct_of_sales: body.marketing_pct_of_sales,
          marketing_boost_months: body.marketing_boost_months,
          marketing_boost_multiplier: body.marketing_boost_multiplier,
          gna_pct_of_sales: body.gna_pct_of_sales,
          corporate_overhead_flat_monthly: body.corporate_overhead_flat_monthly,
        },
        { onConflict: "scenario_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving opex assumptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
