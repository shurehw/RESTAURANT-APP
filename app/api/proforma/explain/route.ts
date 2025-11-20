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
    const { scenario_id } = body;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch scenario with assumptions and project
    const { data: scenario } = await supabase
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

    if (!scenario) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 404 }
      );
    }

    // Fetch summary metrics
    const { data: summaryData } = await supabase
      .from("proforma_monthly_summary")
      .select("*")
      .eq("scenario_id", scenario_id)
      .order("month_index");

    const revenue = scenario.proforma_revenue_assumptions[0] || {};
    const cogs = scenario.proforma_cogs_assumptions[0] || {};
    const labor = scenario.proforma_labor_assumptions[0] || {};
    const opex = scenario.proforma_occupancy_opex_assumptions[0] || {};
    const capex = scenario.proforma_capex_assumptions[0] || {};
    const project = scenario.proforma_projects;

    // Calculate key metrics
    const year1Data = summaryData?.slice(0, 12) || [];
    const year1Revenue = year1Data.reduce((sum, m) => sum + (m.total_revenue || 0), 0);
    const year1Ebitda = year1Data.reduce((sum, m) => sum + (m.ebitda || 0), 0);
    const ebitdaMargin = year1Revenue > 0 ? (year1Ebitda / year1Revenue) * 100 : 0;

    const totalRevenue = summaryData?.reduce((sum, m) => sum + (m.total_revenue || 0), 0) || 0;
    const totalEbitda = summaryData?.reduce((sum, m) => sum + (m.ebitda || 0), 0) || 0;

    const paybackMonth =
      summaryData?.find((m) => (m.cumulative_cash || 0) >= 0)?.month_index || null;

    // Implied metrics
    const revenuePerSeat = project.seats > 0 ? year1Revenue / project.seats : 0;
    const totalSqft = (project.square_feet_foh || 0) + (project.square_feet_boh || 0);
    const revenuePerSqft = totalSqft > 0 ? year1Revenue / totalSqft : 0;

    const year1Labor = year1Data.reduce((sum, m) => sum + (m.total_labor || 0), 0);
    const year1Opex = year1Data.reduce((sum, m) => sum + (m.total_opex || 0), 0);
    const laborPct = year1Revenue > 0 ? (year1Labor / year1Revenue) * 100 : 0;
    const rentPct =
      year1Revenue > 0 ? ((opex.base_rent_monthly * 12) / year1Revenue) * 100 : 0;

    // Build prompt for Claude
    const prompt = `You are a hospitality finance expert. Write an executive summary of this restaurant proforma scenario that can be shared with investors, lenders, or landlords.

**Project Details:**
- Name: ${project.name}
- Concept: ${project.concept_type}
- Location: ${project.location_city}, ${project.location_state}
- Size: ${project.seats} seats, ${totalSqft} sqft (${project.square_feet_foh} FOH, ${project.square_feet_boh} BOH)

**Scenario:** ${scenario.name}${scenario.is_base ? " (Base Case)" : ""}

**Key Financial Metrics:**
- Year 1 Revenue: $${year1Revenue.toLocaleString()}
- Year 1 EBITDA: $${year1Ebitda.toLocaleString()}
- EBITDA Margin: ${ebitdaMargin.toFixed(1)}%
- Total CapEx: $${capex.total_capex?.toLocaleString()}
- Equity: ${capex.equity_pct}%
- Payback Period: ${paybackMonth ? `${paybackMonth} months` : "Not achieved in projection period"}

**Implied Metrics:**
- Revenue per Seat: $${revenuePerSeat.toLocaleString()}
- Revenue per SqFt: $${revenuePerSqft.toLocaleString()}
- Labor as % of Sales: ${laborPct.toFixed(1)}%
- Rent as % of Sales: ${rentPct.toFixed(1)}%

**Operating Assumptions:**
- Days Open: ${revenue.days_open_per_week} days/week
- Covers (Lunch/Dinner/Late): ${revenue.avg_covers_lunch}/${revenue.avg_covers_dinner}/${revenue.avg_covers_late_night || 0}
- Food COGS: ${cogs.food_cogs_pct}%, Bev COGS: ${cogs.bev_cogs_pct}%
- FOH Productivity: ${labor.foh_hours_per_100_covers} hrs/100 covers @ $${labor.foh_hourly_rate}/hr
- BOH Productivity: ${labor.boh_hours_per_100_covers} hrs/100 covers @ $${labor.boh_hourly_rate}/hr

Please provide:

1. **Executive Summary** (2-3 paragraphs)
   - Overall concept and market positioning
   - Key financial highlights
   - Investment thesis

2. **Key Strengths** (3-5 bullet points)
   - What makes this attractive
   - Competitive advantages
   - Strong metrics

3. **Main Risks** (3-5 bullet points)
   - What could go wrong
   - Key sensitivities
   - Areas of concern

4. **Operational Watch Points** (2-4 bullet points)
   - What operators need to monitor closely in the first 6-12 months
   - Critical success factors

Format as markdown. Be specific and quantitative. Use financial industry language appropriate for sophisticated investors.`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const narrative =
      message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({
      narrative,
      metrics: {
        year1Revenue,
        year1Ebitda,
        ebitdaMargin,
        paybackMonth,
        revenuePerSeat,
        revenuePerSqft,
        laborPct,
        rentPct,
      },
    });
  } catch (error: any) {
    console.error("Error generating narrative:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
