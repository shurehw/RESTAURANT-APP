import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { resolveContext } from '@/lib/auth/resolveContext';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase/service';
import { getTipseePool } from '@/lib/database/tipsee';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { CHATBOT_TOOLS } from '@/lib/chatbot/tools';
import { executeTool } from '@/lib/chatbot/executor';

// Tool-use loop can make multiple API calls; allow up to 60s on Vercel
export const maxDuration = 60;

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

function buildSystemPrompt(venueNames: string[]): string {
  const today = new Date().toISOString().split('T')[0];

  // Calculate 4-4-5 fiscal calendar (fiscal year starts first Monday of January)
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + ((8 - jan1.getDay()) % 7));
  const fyStart = firstMonday;
  const pattern = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]; // weeks per period
  let periodStart = new Date(fyStart);
  let currentPeriod = 1;
  for (let i = 0; i < 12; i++) {
    const periodDays = pattern[i] * 7;
    const periodEnd = new Date(periodStart.getTime() + periodDays * 86400000 - 86400000);
    if (now >= periodStart && now <= periodEnd) {
      currentPeriod = i + 1;
      break;
    }
    periodStart = new Date(periodEnd.getTime() + 86400000);
    currentPeriod = i + 2;
  }
  // Recalculate current period start/end for display
  let pStart = new Date(fyStart);
  for (let i = 0; i < currentPeriod - 1; i++) {
    pStart = new Date(pStart.getTime() + pattern[i] * 7 * 86400000);
  }
  const pEnd = new Date(pStart.getTime() + pattern[currentPeriod - 1] * 7 * 86400000 - 86400000);
  const periodStartStr = pStart.toISOString().split('T')[0];
  const periodEndStr = pEnd.toISOString().split('T')[0];
  const quarter = Math.ceil(currentPeriod / 3);

  return `You are a senior restaurant operations analyst for OpsOS, a restaurant management platform.

Your job is to answer questions about restaurant operations using real POS (point-of-sale) data. You have access to tools that query the restaurant's TipSee POS database directly.

VENUES (the user has access to these locations):
${venueNames.map(n => `- ${n}`).join('\n')}

When the user asks about a specific venue (e.g. "Miami", "Nice Guy", "Dallas"), use the "venue" parameter on tool calls to filter to that location. Use partial matching — "miami" matches "Delilah Miami", "nice guy" matches "Nice Guy LA", etc.
When the user doesn't specify a venue, query ALL venues (omit the venue parameter) and show per-venue breakdowns when relevant.

FISCAL CALENDAR:
- The company runs a 4-4-5 fiscal calendar (4 weeks, 4 weeks, 5 weeks per quarter)
- Fiscal year ${year} starts: ${fyStart.toISOString().split('T')[0]}
- Current period: P${currentPeriod} (${periodStartStr} to ${periodEndStr}), Q${quarter}
- Today: ${today}
- "PTD" = period-to-date (${periodStartStr} to ${today})
- "QTD" = quarter-to-date
- When the user says "current period", "PTD", or "period to date", use ${periodStartStr} to ${today}

AVAILABLE DATA (via tools):

POS Data (TipSee):
- Daily sales: revenue, checks, covers, comps, voids, tax
- Sales by category: food vs beverage breakdown
- Server performance: tickets, covers, sales, tips, turn times
- Top menu items: best sellers by revenue or quantity
- Comp summary: comps grouped by reason code
- Labor: hours worked, labor cost, employee count
- Reservations: guest names, VIP status, party sizes
- Payment details: check totals, tips, cardholder names
- Manager logbook: daily notes and observations

Internal Operations Data:
- Budget vs actual: sales/labor/COGS targets vs actuals with variance severity
- Operational exceptions: issues needing attention (labor overages, high COGS, etc.)
- Demand forecasts: predicted covers and revenue by shift
- Invoices: vendor invoices, amounts, approval status
- Inventory: current on-hand quantities, costs, values

WORKFLOW:
1. When the user asks a data question, ALWAYS call the appropriate tool(s) IMMEDIATELY — do not ask the user to clarify dates or venues if you can reasonably infer them
2. Use the data returned to provide a precise, data-backed answer
3. For comparison questions, call tools multiple times with different date ranges
4. If the user mentions a venue name, use the venue parameter to filter

ANALYSIS GUIDELINES:
- Be numerically precise — show calculations when helpful
- Calculate key metrics: labor cost %, average check, SPLH (sales per labor hour)
- Identify trends, outliers, and anomalies
- Provide actionable recommendations

GUARDRAILS:
- Never fabricate data — only reference data returned by tools
- If a tool returns no data, say so clearly
- Always cite the date range used
- Flag assumptions clearly

TONE:
- Professional but conversational
- Focus on actionable insights
- Use restaurant industry terminology
- Be direct — pull data first, ask questions later`;
}

const MAX_TOOL_ITERATIONS = 5;

export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':chatbot');

    const ctx = await resolveContext();

    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({
        answer: 'Your session has expired. Please refresh the page and log in again.',
        context_used: false,
      });
    }

    if (!ctx.orgId) {
      return NextResponse.json({
        answer: 'Your account is not linked to an organization. Please contact your administrator.',
        context_used: false,
      });
    }

    console.log('[chatbot] Auth OK:', { userId: ctx.authUserId, orgId: ctx.orgId });

    // Get venues for the user's organization (with names for AI context)
    const supabase = getServiceClient();
    const { data: venues } = await (supabase as any)
      .from('venues')
      .select('id, name')
      .eq('organization_id', ctx.orgId);
    const venueIds: string[] = (venues || []).map((v: any) => v.id);
    const { data: mappings } = await (supabase as any)
      .from('venue_tipsee_mapping')
      .select('venue_id, tipsee_location_uuid')
      .in('venue_id', venueIds);

    // Build venue name → location UUID mapping for per-venue filtering
    const venueMap: Record<string, { venueId: string; locationUuid: string }> = {};
    const locationUuids: string[] = [];
    for (const m of mappings || []) {
      if (!m.tipsee_location_uuid) continue;
      locationUuids.push(m.tipsee_location_uuid);
      const venue = (venues || []).find((v: any) => v.id === m.venue_id);
      if (venue?.name) {
        venueMap[venue.name.toLowerCase()] = {
          venueId: m.venue_id,
          locationUuid: m.tipsee_location_uuid,
        };
      }
    }

    if (locationUuids.length === 0) {
      return NextResponse.json({
        answer: 'No POS locations are linked to your account. Please contact your administrator to set up TipSee venue mapping.',
        context_used: false,
      });
    }

    // Build venue list for AI context
    const venueNames = (venues || [])
      .filter((v: any) => venueMap[v.name?.toLowerCase()])
      .map((v: any) => v.name);

    const body = await req.json();
    const { question, history } = chatSchema.parse(body);

    // Build messages
    const messages: Anthropic.MessageParam[] = [];
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: question });

    const pool = getTipseePool();
    const toolCtx = { locationUuids, venueIds, venueMap, pool, supabase };
    const systemPrompt = buildSystemPrompt(venueNames);

    // Tool-use loop
    let response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages,
      tools: CHATBOT_TOOLS,
      max_tokens: 1500,
      temperature: 0.3,
    });

    for (let i = 0; i < MAX_TOOL_ITERATIONS && response.stop_reason === 'tool_use'; i++) {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      // Append assistant's response (includes tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      // Execute all tool calls in parallel
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: await executeTool(
            block.name,
            block.input as Record<string, any>,
            toolCtx
          ),
        }))
      );

      messages.push({ role: 'user', content: toolResults });

      response = await getAnthropic().messages.create({
        model: 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        messages,
        tools: CHATBOT_TOOLS,
        max_tokens: 1500,
        temperature: 0.3,
      });
    }

    // Extract final text answer
    const textBlock = response.content.find((b) => b.type === 'text');
    const answer = textBlock?.type === 'text' ? textBlock.text : '';

    return NextResponse.json({
      answer,
      context_used: true,
    });
  });
}
