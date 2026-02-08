import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

const chatSchema = z.object({
  question: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * Fetch relevant context from Supabase based on user question
 */
async function getRelevantContext(
  question: string,
  venueIds: string[],
  supabase: any
): Promise<string> {
  const contextParts: string[] = [];

  // Detect what the question is about
  const lowerQ = question.toLowerCase();

  // Sales/Revenue queries
  if (lowerQ.includes('sales') || lowerQ.includes('revenue')) {
    const { data: posData } = await supabase
      .from('pos_daily_sales')
      .select('*')
      .in('venue_id', venueIds)
      .order('business_date', { ascending: false })
      .limit(30);

    if (posData && posData.length > 0) {
      contextParts.push('=== SALES DATA ===');
      posData.forEach((row: any) => {
        contextParts.push(
          `Date: ${row.business_date}; Venue: ${row.venue_id}; Net Sales: ${row.net_sales}; ` +
          `Gross Sales: ${row.gross_sales}; Guests: ${row.guest_count}; Tax: ${row.sales_tax}`
        );
      });
    }
  }

  // Labor queries
  if (lowerQ.includes('labor') || lowerQ.includes('schedule') || lowerQ.includes('shift')) {
    const { data: laborData } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        employee:employees(first_name, last_name),
        position:positions(name, category, base_hourly_rate)
      `)
      .in('venue_id', venueIds)
      .order('business_date', { ascending: false })
      .limit(50);

    if (laborData && laborData.length > 0) {
      contextParts.push('=== LABOR DATA ===');
      laborData.forEach((row: any) => {
        contextParts.push(
          `Date: ${row.business_date}; Employee: ${row.employee?.first_name} ${row.employee?.last_name}; ` +
          `Position: ${row.position?.name}; Hours: ${row.scheduled_hours}; ` +
          `Rate: $${row.position?.base_hourly_rate}/hr; Status: ${row.status}`
        );
      });
    }
  }

  // Inventory/COGS queries
  if (lowerQ.includes('inventory') || lowerQ.includes('stock') || lowerQ.includes('cogs') || lowerQ.includes('cost')) {
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select(`
        *,
        vendor:vendors(name),
        lines:invoice_lines(quantity, unit_cost, total_cost, product:products(name, category))
      `)
      .in('venue_id', venueIds)
      .order('invoice_date', { ascending: false })
      .limit(20);

    if (invoiceData && invoiceData.length > 0) {
      contextParts.push('=== INVOICE/COGS DATA ===');
      invoiceData.forEach((inv: any) => {
        const total = inv.lines?.reduce((sum: number, line: any) => sum + (line.total_cost || 0), 0) || 0;
        contextParts.push(
          `Date: ${inv.invoice_date}; Vendor: ${inv.vendor?.name}; ` +
          `Invoice #: ${inv.invoice_number}; Total: $${total.toFixed(2)}; Status: ${inv.status}`
        );
      });
    }
  }

  // Budget queries
  if (lowerQ.includes('budget')) {
    const { data: budgetData } = await supabase
      .from('budgets')
      .select('*')
      .in('venue_id', venueIds)
      .order('period_start', { ascending: false })
      .limit(10);

    if (budgetData && budgetData.length > 0) {
      contextParts.push('=== BUDGET DATA ===');
      budgetData.forEach((row: any) => {
        contextParts.push(
          `Period: ${row.period_start} to ${row.period_end}; Category: ${row.category}; ` +
          `Budget: $${row.amount}; Spent: $${row.actual_amount || 0}; ` +
          `Remaining: $${row.amount - (row.actual_amount || 0)}`
        );
      });
    }
  }

  // Forecasts
  if (lowerQ.includes('forecast') || lowerQ.includes('predict')) {
    const { data: forecastData } = await supabase
      .from('demand_forecasts')
      .select('*')
      .in('venue_id', venueIds)
      .gte('business_date', new Date().toISOString().split('T')[0])
      .order('business_date')
      .limit(30);

    if (forecastData && forecastData.length > 0) {
      contextParts.push('=== DEMAND FORECASTS ===');
      forecastData.forEach((row: any) => {
        contextParts.push(
          `Date: ${row.business_date}; Shift: ${row.shift_type}; ` +
          `Predicted Covers: ${row.covers_predicted}; Predicted Revenue: $${row.revenue_predicted}; ` +
          `Confidence: ${(row.confidence_level * 100).toFixed(0)}%`
        );
      });
    }
  }

  return contextParts.join('\n');
}

/**
 * System prompt for OpsOS chatbot
 */
const SYSTEM_PROMPT = `You are a senior restaurant operations analyst for OpsOS, a restaurant management platform.

Your job is to analyze operational data (sales, labor, inventory, budgets) and provide clear, actionable insights to restaurant managers.

DATA SOURCES:
You have access to row-level operational data from multiple restaurants including:
- Daily POS sales (net sales, gross sales, guest count, taxes)
- Labor schedules and shifts (employees, positions, hours, rates)
- Invoices and COGS (vendor purchases, product costs)
- Budgets (planned vs actual spend by category)
- Demand forecasts (predicted covers and revenue)

DATA FORMAT:
- Each data section starts with "=== [TYPE] DATA ==="
- Rows are semicolon-separated key-value pairs
- All monetary values are in USD
- Dates are in YYYY-MM-DD format

ANALYSIS GUIDELINES:
1. Be numerically precise - show calculations when helpful
2. Compare time periods (day-over-day, week-over-week, month-over-month)
3. Calculate key metrics:
   - Labor cost % (labor cost / sales * 100)
   - Average check (sales / guest count)
   - Cost per guest (total costs / guest count)
   - Budget variance (actual - budget) and % variance
   - Forecast accuracy (actual - predicted) and % error
4. Identify trends, outliers, and anomalies
5. Provide actionable recommendations

OUTPUT FORMAT:
1. Direct answer (1-2 sentences)
2. Key calculations (bullets or table)
3. Insights and recommendations
4. Data sources used

GUARDRAILS:
- Never fabricate data
- If data is missing, state what's needed
- Always cite date ranges and venues used
- Flag assumptions clearly

TONE:
- Professional but conversational
- Focus on actionable insights
- Use restaurant industry terminology`;

export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':chatbot');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const body = await req.json();
    const { question, history } = chatSchema.parse(body);

    // Get relevant context from database
    const supabase = await createClient();
    const context = await getRelevantContext(question, venueIds, supabase);

    // Build messages for Claude
    const messages: Anthropic.MessageParam[] = [];

    // Add conversation history
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current question with context
    const userContent = context
      ? `Relevant operational data:\n\n${context}\n\n---\n\n${question}`
      : question;
    messages.push({ role: 'user', content: userContent });

    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
      max_tokens: 1000,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const answer = textBlock?.type === 'text' ? textBlock.text : '';

    return NextResponse.json({
      answer,
      context_used: context ? true : false,
    });
  });
}
