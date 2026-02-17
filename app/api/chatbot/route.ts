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
import { getFiscalPeriod, type FiscalCalendarType } from '@/lib/fiscal-calendar';

// Tool-use loop can make multiple API calls; allow up to 60s on Vercel
export const maxDuration = 60;

const chatSchema = z.object({
  question: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  conversationId: z.string().uuid().optional(),
});

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * Build the list of notable dates/events near today for AI context.
 * Includes major US holidays, cultural events, and high-impact restaurant nights.
 */
function getUpcomingEvents(today: Date): string {
  const year = today.getFullYear();

  // Static holidays & events (month is 0-indexed)
  const events: { date: Date; name: string; impact: string }[] = [
    { date: new Date(year, 0, 1), name: "New Year's Day", impact: 'Brunch rush, lower dinner' },
    { date: new Date(year, 1, 14), name: "Valentine's Day", impact: 'Peak dinner covers, prix-fixe menus, high avg check' },
    { date: new Date(year, 2, 17), name: "St. Patrick's Day", impact: 'High bar sales, extended hours' },
    { date: new Date(year, 4, 5), name: 'Cinco de Mayo', impact: 'High bar/tequila sales' },
    { date: new Date(year, 6, 4), name: 'Independence Day', impact: 'Brunch/patio traffic, may close early' },
    { date: new Date(year, 9, 31), name: 'Halloween', impact: 'Late-night traffic, bar-heavy' },
    { date: new Date(year, 11, 24), name: 'Christmas Eve', impact: 'Early close or special menus' },
    { date: new Date(year, 11, 25), name: 'Christmas Day', impact: 'Likely closed or limited' },
    { date: new Date(year, 11, 31), name: "New Year's Eve", impact: 'Peak revenue night, special events, prix-fixe' },
  ];

  // Dynamic holidays (approximate — good enough for context)
  // Super Bowl: first Sunday in February
  const feb1 = new Date(year, 1, 1);
  const superBowlDay = feb1.getDay() === 0 ? 1 : (7 - feb1.getDay()) + 1;
  events.push({ date: new Date(year, 1, superBowlDay), name: 'Super Bowl Sunday', impact: 'Huge bar sales, watch parties, high covers' });

  // Mother's Day: second Sunday in May
  const may1 = new Date(year, 4, 1);
  const mothersDayDay = may1.getDay() === 0 ? 8 : (14 - may1.getDay()) + 1;
  events.push({ date: new Date(year, 4, mothersDayDay), name: "Mother's Day", impact: 'Peak brunch, high covers, prix-fixe' });

  // Father's Day: third Sunday in June
  const jun1 = new Date(year, 5, 1);
  const fathersDayDay = jun1.getDay() === 0 ? 15 : (21 - jun1.getDay()) + 1;
  events.push({ date: new Date(year, 5, fathersDayDay), name: "Father's Day", impact: 'High dinner covers, steakhouse peak' });

  // Thanksgiving: fourth Thursday in November
  const nov1 = new Date(year, 10, 1);
  const thanksgivingDay = nov1.getDay() <= 4 ? (4 - nov1.getDay()) + 22 : (11 - nov1.getDay()) + 22;
  events.push({ date: new Date(year, 10, thanksgivingDay), name: 'Thanksgiving', impact: 'Special menu or closed, Wed before is big bar night' });

  // Memorial Day: last Monday in May
  const may31 = new Date(year, 4, 31);
  const memorialDay = may31.getDay() >= 1 ? 31 - (may31.getDay() - 1) : 31 - 6;
  events.push({ date: new Date(year, 4, memorialDay), name: 'Memorial Day', impact: 'Weekend brunch surge, summer kickoff' });

  // Labor Day: first Monday in September
  const sep1 = new Date(year, 8, 1);
  const laborDayDay = sep1.getDay() === 1 ? 1 : sep1.getDay() === 0 ? 2 : (8 - sep1.getDay()) + 1;
  events.push({ date: new Date(year, 8, laborDayDay), name: 'Labor Day', impact: 'Weekend brunch surge, end of summer' });

  // Sort by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Format date as YYYY-MM-DD
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const todayMs = today.getTime();
  const msPerDay = 86400000;

  // Find events within ±14 days for "nearby" context, plus list all for the year
  const nearby = events.filter(e => {
    const diff = e.date.getTime() - todayMs;
    return diff >= -7 * msPerDay && diff <= 14 * msPerDay;
  });

  let section = 'MAJOR EVENTS & HOLIDAYS (affects traffic and revenue patterns):\n';

  if (nearby.length > 0) {
    section += 'Nearby events:\n';
    for (const e of nearby) {
      const diffDays = Math.round((e.date.getTime() - todayMs) / msPerDay);
      const rel = diffDays === 0 ? 'TODAY' : diffDays < 0 ? `${Math.abs(diffDays)} days ago` : `in ${diffDays} days`;
      section += `- ${e.name} (${fmt(e.date)}, ${rel}): ${e.impact}\n`;
    }
    section += '\n';
  }

  section += 'Full calendar:\n';
  for (const e of events) {
    const isPast = e.date.getTime() < todayMs;
    section += `- ${fmt(e.date)}: ${e.name}${isPast ? ' (past)' : ''} — ${e.impact}\n`;
  }

  section += `\nWhen analyzing data near these dates, factor in event-driven traffic changes. Compare event-day performance to the previous week's same day-of-week for meaningful context.`;

  return section;
}

function buildSystemPrompt(
  venueNames: string[],
  fiscal: { calendarType: FiscalCalendarType; periodInfo: ReturnType<typeof getFiscalPeriod> }
): string {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const { calendarType, periodInfo } = fiscal;
  const { fiscalYear, fiscalQuarter, fiscalPeriod, periodStartDate, periodEndDate } = periodInfo;

  const calendarLabel = calendarType === 'standard' ? 'standard monthly' : calendarType;
  const eventsSection = getUpcomingEvents(now);

  return `You are a senior restaurant operations analyst for OpsOS, a restaurant management platform.

Your job is to answer questions about restaurant operations using real POS (point-of-sale) data. You have access to tools that query the restaurant's TipSee POS database directly.

VENUES (the user has access to these locations):
${venueNames.map(n => `- ${n}`).join('\n')}

When the user asks about a specific venue (e.g. "Miami", "Nice Guy", "Dallas"), use the "venue" parameter on tool calls to filter to that location. Use partial matching — "miami" matches "Delilah Miami", "nice guy" matches "Nice Guy LA", etc.
When the user doesn't specify a venue, query ALL venues (omit the venue parameter) and show per-venue breakdowns when relevant.

FISCAL CALENDAR:
- Calendar type: ${calendarLabel}
- Current period: P${fiscalPeriod} (${periodStartDate} to ${periodEndDate}), Q${fiscalQuarter}, FY${fiscalYear}
- Today: ${today}
- "PTD" = period-to-date (${periodStartDate} to ${today})
- "QTD" = quarter-to-date
- When the user says "current period", "PTD", or "period to date", use ${periodStartDate} to ${today}

${eventsSection}

DATA SYNC TIMING:
- POS data from TipSee syncs nightly, typically completing by 6–8 AM ET the next day
- If "last night" returns no data, it may not have synced yet — suggest trying the previous day or checking back later
- Labor punch data may lag 12–24 hours behind sales data

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

Real-Time / Pulse Data:
- Live sales pace: current revenue, covers, checks, food/bev split, pace vs forecast and same-day-last-week (SDLW), projected end-of-day. Use for "how are we pacing tonight?" or "are we ahead of last week?"
- Check detail: full item-level detail for a specific check (items, payments, tips, comps, voids)
- Check search: browse or filter checks by date, server, or table for a venue. Use for "show me Sarah's checks" or "what's on table 5?"
- Period comparison: WTD (week-to-date), PTD (period-to-date), YTD (year-to-date) performance vs the same window in the prior period. Use for "how's our week going?" or "are we up or down YTD?"

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
- If a tool returns no data, say so clearly and suggest possible reasons (data hasn't synced yet, venue not mapped, date too far back, etc.)
- If the question is outside your data scope (e.g. marketing, HR, accounting journal entries), say so and suggest what you CAN help with
- Always cite the date range used
- Flag assumptions clearly
- For live pace questions, note that data refreshes every 5 minutes during service hours
- If multiple tool calls return errors, summarize the issue concisely rather than showing raw error messages

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

    // Fetch org fiscal calendar settings
    const { data: orgSettings } = await (supabase as any)
      .from('organization_settings')
      .select('fiscal_calendar_type, fiscal_year_start_date')
      .eq('organization_id', ctx.orgId)
      .single();

    const calendarType: FiscalCalendarType = orgSettings?.fiscal_calendar_type || '4-4-5';
    const fyStartDate: string | null = orgSettings?.fiscal_year_start_date || null;
    const periodInfo = getFiscalPeriod(new Date(), calendarType, fyStartDate);

    const body = await req.json();
    const { question, history, conversationId: clientConvId } = chatSchema.parse(body);

    // conversation_id lets us group messages in the same chat session
    const conversationId = clientConvId || crypto.randomUUID();
    const startTime = Date.now();
    const toolsUsed: string[] = [];

    // Build messages
    const messages: Anthropic.MessageParam[] = [];
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: question });

    const pool = getTipseePool();
    const toolCtx = { locationUuids, venueIds, venueMap, pool, supabase };
    const systemPrompt = buildSystemPrompt(venueNames, { calendarType, periodInfo });

    // Tool-use loop
    let toolCallCount = 0;
    let response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages,
      tools: CHATBOT_TOOLS,
      max_tokens: 3000,
      temperature: 0.3,
    });

    for (let i = 0; i < MAX_TOOL_ITERATIONS && response.stop_reason === 'tool_use'; i++) {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      // Track tools used
      for (const block of toolBlocks) {
        if (!toolsUsed.includes(block.name)) toolsUsed.push(block.name);
        toolCallCount++;
      }

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
        max_tokens: 3000,
        temperature: 0.3,
      });
    }

    // Extract final text answer
    const textBlock = response.content.find((b) => b.type === 'text');
    const answer = textBlock?.type === 'text' ? textBlock.text : '';
    const responseTimeMs = Date.now() - startTime;

    // Log conversation async (fire-and-forget — never block the response)
    (supabase as any)
      .from('chatbot_conversations')
      .insert({
        conversation_id: conversationId,
        org_id: ctx.orgId,
        user_id: ctx.authUserId,
        venue_ids: venueIds,
        question,
        answer,
        tools_used: toolsUsed,
        tool_calls: toolCallCount,
        model: 'claude-haiku-4-5-20251001',
        response_time_ms: responseTimeMs,
      })
      .then(({ error }: { error: any }) => {
        if (error) console.error('[chatbot] Failed to log conversation:', error.message);
      });

    return NextResponse.json({
      answer,
      conversationId,
      context_used: true,
    });
  });
}
