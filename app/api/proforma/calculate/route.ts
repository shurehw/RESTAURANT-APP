import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Helper: get seasonality factor for a given month (0-11)
function getSeasonalityFactor(curve: number[] | null, monthIndex: number): number {
  if (!curve || !Array.isArray(curve) || curve.length !== 12) {
    return 1.0;
  }
  return curve[monthIndex] || 1.0;
}

// Helper: create canonical hash of inputs for reproducibility
function hashInputs(scenario: any, revenue: any, cogs: any, labor: any, opex: any, capex: any, salariedRoles: any[]): string {
  const canonical = JSON.stringify({
    scenario: { id: scenario.id, months: scenario.months, start_month: scenario.start_month, opening_month: scenario.opening_month },
    revenue,
    cogs,
    labor,
    opex,
    capex,
    salariedRoles,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
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

    // Fetch scenario with all assumptions
    const { data: scenario, error: scenarioError } = await supabase
      .from("proforma_scenarios")
      .select(
        `
        *,
        proforma_revenue_assumptions (*),
        proforma_cogs_assumptions (*),
        proforma_labor_assumptions (*),
        proforma_occupancy_opex_assumptions (*),
        proforma_capex_assumptions (*),
        proforma_projects (*)
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

    const revenue = scenario.proforma_revenue_assumptions[0];
    const cogs = scenario.proforma_cogs_assumptions[0];
    const labor = scenario.proforma_labor_assumptions[0];
    const opex = scenario.proforma_occupancy_opex_assumptions[0];
    const capex = scenario.proforma_capex_assumptions[0];
    const project = scenario.proforma_projects;

    if (!revenue || !cogs || !labor || !opex || !capex) {
      return NextResponse.json(
        { error: "Missing assumptions" },
        { status: 400 }
      );
    }

    // Fetch salaried roles
    const { data: salariedRoles } = await supabase
      .from("proforma_labor_salaried_roles")
      .select("*")
      .eq("scenario_id", scenario_id);

    // Fetch service periods
    const { data: servicePeriods } = await supabase
      .from("proforma_revenue_service_periods")
      .select("*")
      .eq("scenario_id", scenario_id)
      .order("sort_order");

    // Fetch PDRs
    const { data: pdrs } = await supabase
      .from("proforma_revenue_pdr")
      .select("*")
      .eq("scenario_id", scenario_id);

    // Create calc run record using service role client
    const serviceSupabase = await createClient();
    const inputsHash = hashInputs(scenario, revenue, cogs, labor, opex, capex, salariedRoles || []);

    const { data: calcRun, error: calcRunError } = await serviceSupabase
      .from("proforma_calc_runs")
      .insert({
        scenario_id,
        engine_version: "1.0.0", // TODO: use actual git sha or package version
        inputs_hash: inputsHash,
        status: "running",
      })
      .select()
      .single();

    if (calcRunError || !calcRun) {
      console.error("Failed to create calc run:", calcRunError);
      return NextResponse.json(
        { error: "Failed to create calculation run" },
        { status: 500 }
      );
    }

    const calcRunId = calcRun.id;

    // Get preopening cash flow (cumulative preopening capital spent)
    const { data: preopeningData } = await supabase
      .from("proforma_preopening_monthly")
      .select("amount")
      .eq("scenario_id", scenario_id);

    const totalPreopeningCapital = preopeningData
      ? Math.abs(preopeningData.reduce((sum, m) => sum + (m.amount || 0), 0))
      : 0;

    // Calculate monthly results
    // Use opening_month (not start_month) - this is when operating P&L begins
    const operatingStart = scenario.opening_month || scenario.start_month;
    const operatingStartDate = new Date(operatingStart);
    const daysPerMonth = revenue.days_open_per_week * 4.33;

    let cumulativeCash = -totalPreopeningCapital; // Start with negative preopening capital
    let paybackMonth: number | null = null;

    for (let monthIndex = 1; monthIndex <= scenario.months; monthIndex++) {
      // Calculate period date from opening month (not old start_month)
      const periodDate = new Date(operatingStartDate);
      periodDate.setMonth(periodDate.getMonth() + monthIndex - 1);

      // === REVENUE CALCULATION ===

      // Ramp factor (linear 0 to 1)
      const rampFactor =
        monthIndex <= revenue.ramp_months
          ? monthIndex / revenue.ramp_months
          : 1.0;

      // Seasonality factor (calendar month 0-11)
      const calendarMonth = periodDate.getMonth();
      const seasonalityFactor = getSeasonalityFactor(
        revenue.seasonality_curve,
        calendarMonth
      );

      // Base covers by daypart
      const coversLunch = (revenue.avg_covers_lunch || 0) * daysPerMonth;
      const coversDinner = (revenue.avg_covers_dinner || 0) * daysPerMonth;
      const coversLateNight = (revenue.avg_covers_late_night || 0) * daysPerMonth;

      const baseCovers = coversLunch + coversDinner + coversLateNight;
      const totalCovers = baseCovers * rampFactor * seasonalityFactor;

      // Per-daypart check avgs (fallback to global)
      const foodLunch =
        revenue.avg_check_food_lunch ?? revenue.avg_check_food ?? 0;
      const foodDinner =
        revenue.avg_check_food_dinner ?? revenue.avg_check_food ?? 0;
      const foodLate =
        revenue.avg_check_food_late_night ?? revenue.avg_check_food ?? 0;

      const bevLunch =
        revenue.avg_check_bev_lunch ?? revenue.avg_check_bev ?? 0;
      const bevDinner =
        revenue.avg_check_bev_dinner ?? revenue.avg_check_bev ?? 0;
      const bevLate =
        revenue.avg_check_bev_late_night ?? revenue.avg_check_bev ?? 0;

      // Revenue by daypart
      const foodRevenueLunch = coversLunch * foodLunch * rampFactor * seasonalityFactor;
      const foodRevenueDinner = coversDinner * foodDinner * rampFactor * seasonalityFactor;
      const foodRevenueLate = coversLateNight * foodLate * rampFactor * seasonalityFactor;
      const foodRevenue = foodRevenueLunch + foodRevenueDinner + foodRevenueLate;

      const bevRevenueLunch = coversLunch * bevLunch * rampFactor * seasonalityFactor;
      const bevRevenueDinner = coversDinner * bevDinner * rampFactor * seasonalityFactor;
      const bevRevenueLate = coversLateNight * bevLate * rampFactor * seasonalityFactor;
      const bevRevenue = bevRevenueLunch + bevRevenueDinner + bevRevenueLate;

      const otherRevenue = (foodRevenue + bevRevenue) * revenue.other_mix_pct;
      let totalRevenue = foodRevenue + bevRevenue + otherRevenue;

      // === ADD SERVICE PERIODS REVENUE ===
      if (servicePeriods && servicePeriods.length > 0) {
        for (const service of servicePeriods) {
          const monthlyCovers = service.avg_covers_per_service * service.days_per_week * 4.33;
          const serviceFoodRev = monthlyCovers * service.avg_food_check * rampFactor * seasonalityFactor;
          const serviceBevRev = monthlyCovers * service.avg_bev_check * rampFactor * seasonalityFactor;
          totalRevenue += serviceFoodRev + serviceBevRev;
        }
      }

      // === ADD PDR REVENUE ===
      if (pdrs && pdrs.length > 0) {
        for (const pdr of pdrs) {
          const pdrRampFactor =
            monthIndex <= pdr.ramp_months
              ? monthIndex / pdr.ramp_months
              : 1.0;

          const baseRevenue = pdr.events_per_month * pdr.avg_party_size * pdr.avg_spend_per_person;
          const pdrRevenue = baseRevenue * pdrRampFactor * seasonalityFactor;
          totalRevenue += pdrRevenue;
        }
      }

      // === COGS CALCULATION ===

      const foodCogs = foodRevenue * cogs.food_cogs_pct;
      const bevCogs = bevRevenue * cogs.bev_cogs_pct;
      const otherCogs = otherRevenue * cogs.other_cogs_pct;
      const totalCogs = foodCogs + bevCogs + otherCogs;

      const grossProfit = totalRevenue - totalCogs;

      // === LABOR CALCULATION ===

      // Hourly labor (productivity-based)
      const fohHours = totalCovers * (labor.foh_hours_per_100_covers / 100);
      const bohHours = totalCovers * (labor.boh_hours_per_100_covers / 100);

      const hourlyWages =
        fohHours * labor.foh_hourly_rate +
        bohHours * labor.boh_hourly_rate;

      // Management salaries (legacy columns + new salaried roles table)
      let managementSalaries = 0;

      // Legacy columns
      if (labor.gm_salary_annual) managementSalaries += labor.gm_salary_annual / 12;
      if (labor.agm_salary_annual) managementSalaries += labor.agm_salary_annual / 12;
      if (labor.km_salary_annual) managementSalaries += labor.km_salary_annual / 12;

      // New flexible roles
      if (salariedRoles) {
        for (const role of salariedRoles) {
          const active =
            monthIndex >= role.start_month &&
            (role.end_month == null || monthIndex <= role.end_month);
          if (active) {
            managementSalaries += role.annual_salary / 12;
          }
        }
      }

      const grossWages = hourlyWages + managementSalaries;
      const payrollBurden = grossWages * labor.payroll_burden_pct;
      const totalLabor = grossWages + payrollBurden;

      // === OPEX CALCULATION ===

      // Occupancy
      const totalOccupancy =
        opex.base_rent_monthly +
        opex.cam_monthly +
        opex.property_tax_monthly +
        opex.utilities_monthly +
        opex.insurance_monthly;

      // Variable opex
      const variableOpex =
        totalRevenue * opex.linen_pct_of_sales +
        totalRevenue * opex.smallwares_pct_of_sales +
        totalRevenue * opex.cleaning_supplies_pct +
        totalRevenue * opex.cc_fees_pct_of_sales +
        opex.other_opex_flat_monthly;

      // Marketing (with boost)
      let marketingSpend = totalRevenue * opex.marketing_pct_of_sales;
      if (monthIndex <= opex.marketing_boost_months) {
        marketingSpend *= opex.marketing_boost_multiplier;
      }

      // G&A
      const gna =
        totalRevenue * opex.gna_pct_of_sales +
        opex.corporate_overhead_flat_monthly;

      const totalOpex = totalOccupancy + variableOpex + marketingSpend + gna;

      // === DEBT SERVICE CALCULATION ===

      const equityPct = capex.equity_pct;
      let principal = capex.total_capex * (1 - equityPct);

      // Lender fees
      const lenderFeePct = capex.lender_fee_pct || 0;
      const lenderFee = principal * lenderFeePct;

      if (capex.lender_fee_capitalize) {
        principal += lenderFee;
      }
      // If not capitalized, treat as month 1 expense (handled in opex/gna if needed)

      const monthlyRate = capex.debt_interest_rate / 12;

      let debtService = 0;
      if (principal > 0 && monthlyRate > 0) {
        if (monthIndex <= capex.interest_only_months) {
          // Interest only
          debtService = principal * monthlyRate;
        } else {
          // Amortizing
          const remainingMonths =
            capex.debt_term_months - capex.interest_only_months;
          if (remainingMonths > 0) {
            debtService =
              (principal *
                monthlyRate *
                Math.pow(1 + monthlyRate, remainingMonths)) /
              (Math.pow(1 + monthlyRate, remainingMonths) - 1);
          }
        }
      }

      // === P&L & CASH FLOW ===

      const ebitda = grossProfit - totalLabor - totalOpex;
      const netIncome = ebitda - debtService;

      // Simple cash flow (v1: no WC, no pre-opening)
      const cashFlow = ebitda - debtService;
      cumulativeCash += cashFlow;

      // Track payback month
      if (paybackMonth === null && cumulativeCash >= 0) {
        paybackMonth = monthIndex;
      }

      // === SAVE TO DATABASE ===

      await serviceSupabase.from("proforma_monthly_summary").insert({
        scenario_id,
        calc_run_id: calcRunId,
        month_index: monthIndex,
        period_start_date: periodDate.toISOString().split("T")[0],
        total_revenue: totalRevenue,
        food_revenue: foodRevenue,
        bev_revenue: bevRevenue,
        other_revenue: otherRevenue,
        total_cogs: totalCogs,
        total_labor: totalLabor,
        total_opex: totalOpex,
        gross_profit: grossProfit,
        ebitda,
        debt_service: debtService,
        net_income: netIncome,
        cash_flow: cashFlow,
        cumulative_cash: cumulativeCash,
        total_covers: totalCovers,
      });
    }

    // Mark calc run as succeeded
    await serviceSupabase
      .from("proforma_calc_runs")
      .update({ status: "succeeded" })
      .eq("id", calcRunId);

    // Calculate summary metrics
    const { data: summaryData } = await supabase
      .from("proforma_monthly_summary")
      .select("*")
      .eq("calc_run_id", calcRunId)
      .order("month_index");

    const year1Data = summaryData?.slice(0, 12) || [];
    const year1Revenue = year1Data.reduce((sum, m) => sum + (m.total_revenue || 0), 0);
    const year1Ebitda = year1Data.reduce((sum, m) => sum + (m.ebitda || 0), 0);
    const ebitdaMargin = year1Revenue > 0 ? (year1Ebitda / year1Revenue) * 100 : 0;

    return NextResponse.json({
      success: true,
      calc_run_id: calcRunId,
      summary: {
        year1Revenue,
        year1Ebitda,
        ebitdaMargin,
        paybackMonth,
        totalMonths: scenario.months,
      },
    });
  } catch (error: any) {
    console.error("Error calculating proforma:", error);

    // Mark calc run as failed if we created one
    try {
      const serviceSupabase = await createClient();
      // Extract scenario_id from the error context if available
      const body = await new Response(error.request?.body).json().catch(() => ({}));
      if (body.scenario_id) {
        await serviceSupabase
          .from("proforma_calc_runs")
          .update({ status: "failed", error: error.message })
          .eq("scenario_id", body.scenario_id)
          .eq("status", "running");
      }
    } catch (updateError) {
      console.error("Failed to mark calc run as failed:", updateError);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
