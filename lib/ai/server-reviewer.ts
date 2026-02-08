/**
 * AI-Powered Server Performance Reviewer
 * Generates natural language coaching feedback for individual servers
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ServerReviewInput {
  date: string;
  venueName: string;
  periodLabel?: string; // 'Tonight' | 'Week to Date' | 'Period to Date'
  server: {
    employee_name: string;
    employee_role_name: string;
    tickets: number;
    covers: number;
    net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
    tip_pct: number | null;
    total_tips: number;
  };
  teamAverages: {
    avg_covers: number;
    avg_net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
    avg_tip_pct: number | null;
    server_count: number;
  };
}

export interface ServerReviewOutput {
  overallRating: 'excellent' | 'strong' | 'average' | 'needs_improvement';
  summary: string;
  strengths: string[];
  improvements: string[];
  coachingTip: string;
}

/**
 * Generate AI coaching feedback for a single server's performance
 */
export async function reviewServerPerformance(
  input: ServerReviewInput
): Promise<ServerReviewOutput> {
  const prompt = buildServerReviewPrompt(input);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    temperature: 0.3,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  const response = JSON.parse(textContent.text);
  return response as ServerReviewOutput;
}

function buildServerReviewPrompt(input: ServerReviewInput): string {
  const { server, teamAverages } = input;

  const pctDiff = (val: number, avg: number) => {
    if (avg === 0) return 'N/A';
    const diff = ((val - avg) / avg) * 100;
    return diff >= 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`;
  };

  const period = input.periodLabel || 'Tonight';
  const isAggregated = period !== 'Tonight';
  const periodContext = isAggregated
    ? `This is a ${period} review — metrics are aggregated across multiple shifts. Focus on trends and consistency, not single-night anomalies.`
    : '';

  return `You are a restaurant operations coach reviewing a server's ${isAggregated ? period.toLowerCase() : 'nightly'} performance at ${input.venueName} on ${input.date}.
${periodContext ? `\n${periodContext}\n` : ''}
## SERVER: ${server.employee_name} (${server.employee_role_name})

### ${period} Metrics vs Team Average (${teamAverages.server_count} servers)

| Metric | ${server.employee_name} | Team Avg | vs Avg |
|--------|------------------------|----------|--------|
| Tickets | ${server.tickets} | ${teamAverages.avg_covers > 0 ? (teamAverages.avg_net_sales / teamAverages.avg_ticket).toFixed(0) : 'N/A'} | ${pctDiff(server.tickets, teamAverages.avg_net_sales > 0 ? teamAverages.avg_net_sales / teamAverages.avg_ticket : 0)} |
| Covers | ${server.covers} | ${teamAverages.avg_covers.toFixed(0)} | ${pctDiff(server.covers, teamAverages.avg_covers)} |
| Net Sales | $${server.net_sales.toFixed(2)} | $${teamAverages.avg_net_sales.toFixed(2)} | ${pctDiff(server.net_sales, teamAverages.avg_net_sales)} |
| Avg/Cover | $${server.avg_per_cover.toFixed(2)} | $${teamAverages.avg_per_cover.toFixed(2)} | ${pctDiff(server.avg_per_cover, teamAverages.avg_per_cover)} |
| Avg Ticket | $${server.avg_ticket.toFixed(2)} | $${teamAverages.avg_ticket.toFixed(2)} | ${pctDiff(server.avg_ticket, teamAverages.avg_ticket)} |
| Turn Time | ${server.avg_turn_mins ? server.avg_turn_mins + ' min' : 'N/A'} | ${teamAverages.avg_turn_mins ? teamAverages.avg_turn_mins.toFixed(0) + ' min' : 'N/A'} | ${server.avg_turn_mins && teamAverages.avg_turn_mins ? pctDiff(server.avg_turn_mins, teamAverages.avg_turn_mins) : 'N/A'} |
| Tip % | ${server.tip_pct != null ? server.tip_pct + '%' : 'N/A'} | ${teamAverages.avg_tip_pct != null ? teamAverages.avg_tip_pct.toFixed(1) + '%' : 'N/A'} | ${server.tip_pct != null && teamAverages.avg_tip_pct != null ? pctDiff(server.tip_pct, teamAverages.avg_tip_pct) : 'N/A'} |

## YOUR TASK

Provide a concise, actionable performance review for this server. Consider:

1. **Sales Performance**: How do their sales and average check compare to the team? Are they upselling effectively?
2. **Guest Engagement**: What does tip % suggest about their guest interactions and service quality?
3. **Efficiency**: Is their turn time reasonable? Are they managing their section well?
4. **Volume**: How many covers and tickets did they handle vs the team?

### Rating Criteria
- **excellent**: Top performer across most metrics, significantly above average
- **strong**: Above average in most areas, no major concerns
- **average**: In line with the team, room for improvement
- **needs_improvement**: Below average in multiple areas, specific coaching needed

### Important
- For turn time, LOWER is generally better (faster turns = more revenue capacity), but context matters
- Tip % reflects guest satisfaction with service - industry standard is 18-22%
- Be specific about what the manager should say to this server
- Keep coaching tips practical and focused on one thing they can do next shift
- Be encouraging even when identifying areas to improve

### Output Format (JSON only, no markdown)

{
  "overallRating": "excellent" | "strong" | "average" | "needs_improvement",
  "summary": "<2-3 sentences summarizing ${period.toLowerCase()} performance>",
  "strengths": ["<specific strength 1>", "<specific strength 2>"],
  "improvements": ["<specific improvement 1>", "<specific improvement 2>"],
  "coachingTip": "<One actionable thing the manager should tell this server for next shift>"
}

Generate the JSON response now:`;
}
