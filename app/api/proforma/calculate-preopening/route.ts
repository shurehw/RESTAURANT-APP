import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Distribution helpers
function getDistributionWeights(
  pattern: string,
  months: number,
  customWeights?: number[]
): number[] {
  if (pattern === "custom" && customWeights && customWeights.length === months) {
    return customWeights;
  }

  const weights: number[] = [];

  switch (pattern) {
    case "front":
      // Front-loaded: 50% in first month, rest distributed
      for (let i = 0; i < months; i++) {
        weights.push(i === 0 ? 0.5 : 0.5 / (months - 1));
      }
      break;

    case "back_loaded":
      // Back-loaded: 50% in last month, 30% in second-to-last, rest even
      for (let i = 0; i < months; i++) {
        if (i === months - 1) {
          weights.push(0.5);
        } else if (i === months - 2) {
          weights.push(0.3);
        } else {
          weights.push(0.2 / (months - 2));
        }
      }
      break;

    case "ramp":
      // Linear ramp: increases each month
      const sum = (months * (months + 1)) / 2;
      for (let i = 0; i < months; i++) {
        weights.push((i + 1) / sum);
      }
      break;

    case "late":
      // Late: 70% in last 2 months, rest even
      for (let i = 0; i < months; i++) {
        if (i >= months - 2) {
          weights.push(0.35);
        } else {
          weights.push(0.3 / (months - 2));
        }
      }
      break;

    case "at_opening":
      // All in last month (e.g., initial inventory)
      for (let i = 0; i < months; i++) {
        weights.push(i === months - 1 ? 1.0 : 0.0);
      }
      break;

    case "even":
    default:
      // Even distribution
      for (let i = 0; i < months; i++) {
        weights.push(1 / months);
      }
      break;
  }

  return weights;
}

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

    // Fetch scenario with preopening assumptions
    const { data: scenario, error: scenarioError } = await supabase
      .from("proforma_scenarios")
      .select(
        `
        *,
        proforma_preopening_assumptions (*)
      `
      )
      .eq("id", scenario_id)
      .single();

    if (scenarioError || !scenario) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 404 }
      );
    }

    const assumptions = scenario.proforma_preopening_assumptions?.[0];

    if (!assumptions) {
      return NextResponse.json(
        { error: "Preopening assumptions not found" },
        { status: 404 }
      );
    }

    // Fetch categories for this org
    const { data: categories } = await supabase
      .from("proforma_preopening_categories")
      .select("*")
      .eq("org_id", scenario.proforma_projects?.org_id)
      .eq("is_summary", false) // Only leaf categories
      .order("display_order");

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        { error: "No preopening categories found" },
        { status: 400 }
      );
    }

    // Delete existing preopening monthly data
    await supabase
      .from("proforma_preopening_monthly")
      .delete()
      .eq("scenario_id", scenario_id);

    // Parse custom distributions if provided
    const customDistributions = assumptions.custom_distributions || {};

    // Map categories to totals and distribution patterns
    const categoryMap: Record<
      string,
      { total: number; pattern: string; customWeights?: number[] }
    > = {
      PREOP_CAPEX_CONSTRUCTION: {
        total: assumptions.total_construction || 0,
        pattern: assumptions.construction_distribution || "back_loaded",
        customWeights: customDistributions.construction,
      },
      PREOP_CAPEX_FFNE: {
        total: assumptions.total_ffne || 0,
        pattern: assumptions.ffne_distribution || "back_loaded",
        customWeights: customDistributions.ffne,
      },
      PREOP_COGS_FNB: {
        total: assumptions.total_initial_inventory_fnb || 0,
        pattern: assumptions.inventory_distribution || "at_opening",
        customWeights: customDistributions.inventory_fnb,
      },
      PREOP_COGS_OTHER: {
        total: assumptions.total_initial_inventory_other || 0,
        pattern: assumptions.inventory_distribution || "at_opening",
        customWeights: customDistributions.inventory_other,
      },
      PREOP_LABOR_FIXED: {
        total: assumptions.total_preopening_payroll_fixed || 0,
        pattern: assumptions.payroll_fixed_distribution || "even",
        customWeights: customDistributions.payroll_fixed,
      },
      PREOP_LABOR_VARIABLE: {
        total: assumptions.total_preopening_payroll_variable || 0,
        pattern: assumptions.payroll_variable_distribution || "ramp",
        customWeights: customDistributions.payroll_variable,
      },
      PREOP_LABOR_BURDEN: {
        total: assumptions.total_preopening_payroll_taxes || 0,
        pattern: assumptions.payroll_variable_distribution || "ramp",
        customWeights: customDistributions.payroll_taxes,
      },
      PREOP_OPEX_OPERATING: {
        total: assumptions.total_preopening_opex_operating || 0,
        pattern: "even",
      },
      PREOP_OPEX_OCCUPANCY: {
        total: assumptions.total_preopening_opex_occupancy || 0,
        pattern: "even",
      },
      PREOP_OPEX_GNA: {
        total: assumptions.total_preopening_opex_gna || 0,
        pattern: "even",
      },
      PREOP_MARKETING: {
        total: assumptions.total_preopening_marketing || 0,
        pattern: assumptions.marketing_distribution || "late",
        customWeights: customDistributions.marketing,
      },
      PREOP_TRAINING: {
        total: assumptions.total_preopening_training || 0,
        pattern: "late",
      },
      PREOP_OPENING_ORDER: {
        total: assumptions.total_preopening_opening_order || 0,
        pattern: "at_opening",
      },
      PREOP_KITCHEN_BAR: {
        total: assumptions.total_preopening_kitchen_bar || 0,
        pattern: "at_opening",
      },
      PREOP_WORKING_CAPITAL: {
        total: assumptions.total_working_capital || 0,
        pattern: "at_opening",
      },
      PREOP_CONTINGENCY: {
        total: assumptions.total_contingency || 0,
        pattern: "even",
      },
      PREOP_MGMT_FEES: {
        total: assumptions.total_preopening_management_fees || 0,
        pattern: "even",
      },
    };

    const months = assumptions.duration_months;
    const preopeningStartDate = new Date(scenario.preopening_start_month || scenario.start_month);

    // Generate monthly schedule
    const monthlyRecords: any[] = [];

    for (const category of categories) {
      const mapping = categoryMap[category.code];
      if (!mapping || mapping.total === 0) continue;

      const weights = getDistributionWeights(
        mapping.pattern,
        months,
        mapping.customWeights
      );

      for (let monthIndex = 1; monthIndex <= months; monthIndex++) {
        const periodDate = new Date(preopeningStartDate);
        periodDate.setMonth(periodDate.getMonth() + monthIndex - 1);

        const amount = -(mapping.total * weights[monthIndex - 1]); // Negative for cash out

        monthlyRecords.push({
          scenario_id,
          month_index: monthIndex,
          period_start_date: periodDate.toISOString().split("T")[0],
          category_id: category.id,
          amount,
        });
      }
    }

    // Bulk insert
    if (monthlyRecords.length > 0) {
      const { error: insertError } = await supabase
        .from("proforma_preopening_monthly")
        .insert(monthlyRecords);

      if (insertError) {
        console.error("Error inserting preopening monthly:", insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    // Calculate summary
    const totalCapital = monthlyRecords.reduce(
      (sum, r) => sum + Math.abs(r.amount),
      0
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalCapital,
        months,
        recordsCreated: monthlyRecords.length,
      },
    });
  } catch (error: any) {
    console.error("Error calculating preopening:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
