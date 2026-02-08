import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase/service';
import { getTipseePool } from '@/lib/database/tipsee';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { CHATBOT_TOOLS } from '@/lib/chatbot/tools';
import { executeTool } from '@/lib/chatbot/executor';

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

const SYSTEM_PROMPT = `You are a senior restaurant operations analyst for OpsOS, a restaurant management platform.

Your job is to answer questions about restaurant operations using real POS (point-of-sale) data. You have access to tools that query the restaurant's TipSee POS database directly.

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
1. When the user asks a data question, ALWAYS call the appropriate tool(s) first
2. Use the data returned to provide a precise, data-backed answer
3. For comparison questions, call tools multiple times with different date ranges
4. Today's date is ${new Date().toISOString().split('T')[0]}

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
- Use restaurant industry terminology`;

const MAX_TOOL_ITERATIONS = 5;

export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':chatbot');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    // Resolve venue IDs → TipSee location UUIDs
    const supabase = getServiceClient();
    const { data: mappings } = await (supabase as any)
      .from('venue_tipsee_mapping')
      .select('tipsee_location_uuid')
      .in('venue_id', venueIds);

    const locationUuids: string[] = (mappings || [])
      .map((m: any) => m.tipsee_location_uuid)
      .filter(Boolean);

    if (locationUuids.length === 0) {
      return NextResponse.json({
        answer: 'No POS locations are linked to your account. Please contact your administrator to set up TipSee venue mapping.',
        context_used: false,
      });
    }

    const body = await req.json();
    const { question, history } = chatSchema.parse(body);

    // Build messages
    const messages: Anthropic.MessageParam[] = [];
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: question });

    const pool = getTipseePool();
    const toolCtx = { locationUuids, venueIds, pool, supabase };

    // Tool-use loop
    let response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      system: SYSTEM_PROMPT,
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
        system: SYSTEM_PROMPT,
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
