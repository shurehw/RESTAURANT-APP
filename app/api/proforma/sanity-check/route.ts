import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { scenario_id, project_id } = body;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch project details
    const { data: project } = await supabase
      .from("proforma_projects")
      .select("*")
      .eq("id", project_id)
      .single();

    // Fetch scenario with all assumptions
    const { data: scenario } = await supabase
      .from("proforma_scenarios")
      .select(
        `
        *,
        proforma_revenue_assumptions (*),
        proforma_cogs_assumptions (*),
        proforma_labor_assumptions (*),
        proforma_occupancy_opex_assumptions (*),
        proforma_capex_assumptions (*)
      `
      )
      .eq("id", scenario_id)
      .single();

    if (!scenario || !project) {
      return NextResponse.json(
        { error: "Scenario or project not found" },
        { status: 404 }
      );
    }

    const revenue = scenario.proforma_revenue_assumptions[0] || {};
    const cogs = scenario.proforma_cogs_assumptions[0] || {};
    const labor = scenario.proforma_labor_assumptions[0] || {};
    const opex = scenario.proforma_occupancy_opex_assumptions[0] || {};
    const capex = scenario.proforma_capex_assumptions[0] || {};

    // Build prompt for Claude
    const prompt = `You are a restaurant finance expert analyzing proforma assumptions for a new concept. Review these assumptions and provide a sanity check with specific warnings and insights.

Project Details:
- Concept: ${project.concept_type} (${project.name})
- Location: ${project.location_city}, ${project.location_state}
- Size: ${project.square_feet_foh} sqft FOH, ${project.square_feet_boh} sqft BOH
- Seats: ${project.seats} total, ${project.bar_seats} bar seats

Revenue Assumptions:
- Days open: ${revenue.days_open_per_week} days/week
- Services per day: ${revenue.services_per_day}
- Avg covers lunch: ${revenue.avg_covers_lunch}
- Avg covers dinner: ${revenue.avg_covers_dinner}
- Avg check food: $${revenue.avg_check_food}
- Avg check bev: $${revenue.avg_check_bev}
- Mix: ${revenue.food_mix_pct}% food, ${revenue.bev_mix_pct}% bev, ${revenue.other_mix_pct}% other
- Ramp: ${revenue.ramp_months} months

COGS Assumptions:
- Food COGS: ${cogs.food_cogs_pct}%
- Bev COGS: ${cogs.bev_cogs_pct}%
- Other COGS: ${cogs.other_cogs_pct}%

Labor Assumptions:
- FOH: ${labor.foh_hours_per_100_covers} hours per 100 covers @ $${labor.foh_hourly_rate}/hr
- BOH: ${labor.boh_hours_per_100_covers} hours per 100 covers @ $${labor.boh_hourly_rate}/hr
- GM: $${labor.gm_salary_annual}/year
- AGM: $${labor.agm_salary_annual}/year
- KM: $${labor.km_salary_annual}/year
- Payroll burden: ${labor.payroll_burden_pct}%

OpEx Assumptions:
- Base rent: $${opex.base_rent_monthly}/month
- Total occupancy: $${(opex.base_rent_monthly || 0) + (opex.cam_monthly || 0) + (opex.property_tax_monthly || 0)}/month
- Marketing: ${opex.marketing_pct_of_sales}% of sales
- G&A: ${opex.gna_pct_of_sales}% of sales

CapEx & Financing:
- Total CapEx: $${capex.total_capex}
- Equity: ${capex.equity_pct}%
- Debt rate: ${capex.debt_interest_rate}%

Please provide:
1. Overall assessment (GOOD, CAUTION, or RED_FLAG)
2. Specific warnings for metrics that are outside industry norms
3. Insights comparing to typical ${project.concept_type} restaurants in ${project.location_city || 'this market'}
4. Calculate implied metrics and flag concerns:
   - Rent per square foot per month
   - Revenue per seat per year
   - Labor cost as % of revenue (implied)
   - Total occupancy as % of revenue (implied)

Format your response as JSON with this structure:
{
  "assessment": "GOOD" | "CAUTION" | "RED_FLAG",
  "warnings": [
    {
      "category": "revenue" | "cogs" | "labor" | "opex" | "capex",
      "severity": "info" | "warning" | "critical",
      "metric": "string",
      "value": "string",
      "benchmark": "string",
      "message": "string"
    }
  ],
  "insights": ["string"],
  "summary": "string"
}`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from response (Claude might wrap it in markdown)
    let sanityCheck;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      sanityCheck = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", responseText);
      sanityCheck = {
        assessment: "CAUTION",
        warnings: [],
        insights: ["Unable to parse AI response. Please review assumptions manually."],
        summary: "Analysis incomplete",
      };
    }

    return NextResponse.json({ sanityCheck });
  } catch (error: any) {
    console.error("Error running sanity check:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
