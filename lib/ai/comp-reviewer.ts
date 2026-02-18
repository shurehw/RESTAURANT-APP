/**
 * AI-Powered Comp Review Agent
 * Analyzes all comp activity and generates actionable recommendations
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CompException, CompExceptionsResult } from '@/lib/database/tipsee';
import type { CompSettings } from '@/lib/database/comp-settings';
import { getDefaultCompSettings } from '@/lib/database/comp-settings';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CompReviewInput {
  date: string;
  venueName: string;
  // All comps for the day
  allComps: Array<{
    check_id: string;
    table_name: string;
    server: string;
    comp_total: number;
    check_total: number;
    reason: string;
    comped_items: Array<{ name: string; quantity: number; amount: number }>;
  }>;
  // Exception data
  exceptions: CompExceptionsResult;
  // Daily summary
  summary: {
    total_comps: number;
    net_sales: number;
    comp_pct: number;
    total_checks: number;
  };
  // Optional: Historical context for comparison
  historical?: {
    avg_daily_comp_pct: number;
    avg_daily_comp_total: number;
    previous_week_comp_pct: number;
  };
}

export interface CompReviewRecommendation {
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'violation' | 'training' | 'process' | 'policy' | 'positive';
  title: string;
  description: string;
  action: string;
  relatedComps?: string[]; // check_ids
}

export interface CompReviewOutput {
  summary: {
    totalReviewed: number;
    approved: number;
    needsFollowup: number;
    urgent: number;
    overallAssessment: string;
  };
  recommendations: CompReviewRecommendation[];
  insights: string[];
}

/**
 * Review all comp activity and generate recommendations
 */
export async function reviewComps(
  input: CompReviewInput,
  settings?: CompSettings
): Promise<CompReviewOutput> {
  // Use provided settings or fallback to defaults
  const compSettings = settings || {
    ...getDefaultCompSettings(),
    org_id: '',
    version: 1,
  };

  const prompt = buildCompReviewPrompt(input, compSettings);

  const message = await anthropic.messages.create({
    model: compSettings.ai_model,
    max_tokens: compSettings.ai_max_tokens,
    temperature: compSettings.ai_temperature,
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

  // Parse the JSON response — strip markdown code fences if present
  let raw = textContent.text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  const response = JSON.parse(raw);
  return response as CompReviewOutput;
}

function buildCompReviewPrompt(input: CompReviewInput, settings: CompSettings): string {
  // Build approved reasons list from settings
  const approvedReasonsList = settings.approved_reasons
    .map(reason => {
      let line = `- ${reason.name}`;
      if (reason.max_amount !== null) {
        line += ` (max $${reason.max_amount})`;
      }
      if (reason.requires_manager_approval) {
        line += ` [requires manager approval]`;
      }
      return line;
    })
    .join('\n');

  return `You are an AI operations consultant reviewing comp activity for ${input.venueName} on ${input.date}.

Your role is to analyze ALL comp activity (not just violations) and provide actionable recommendations to management.

## APPROVED COMP REASONS
${approvedReasonsList}

## THRESHOLDS
- High value comp: $${settings.high_value_comp_threshold}+
- High comp % of check: >${settings.high_comp_pct_threshold}%
- Daily comp % budget: ${settings.daily_comp_pct_warning}% warning, ${settings.daily_comp_pct_critical}% critical

## DATA TO ANALYZE

### Daily Summary
- Total comps: $${input.summary.total_comps.toFixed(2)} (${input.summary.comp_pct.toFixed(1)}% of $${input.summary.net_sales.toFixed(2)} net sales)
- Total checks: ${input.summary.total_checks}
- Comps reviewed: ${input.allComps.length}

${input.historical ? `### Historical Context
- Average daily comp %: ${input.historical.avg_daily_comp_pct.toFixed(1)}%
- Average daily comp total: $${input.historical.avg_daily_comp_total.toFixed(2)}
- Previous week comp %: ${input.historical.previous_week_comp_pct.toFixed(1)}%
` : ''}

### Employee Comp Summary
${(() => {
  // Group comps by employee
  const byEmployee = new Map<string, { count: number; total: number; reasons: Set<string>; maxAmount: number }>();
  input.allComps.forEach(comp => {
    const existing = byEmployee.get(comp.server) || { count: 0, total: 0, reasons: new Set(), maxAmount: 0 };
    existing.count++;
    existing.total += comp.comp_total;
    existing.reasons.add(comp.reason);
    existing.maxAmount = Math.max(existing.maxAmount, comp.comp_total);
    byEmployee.set(comp.server, existing);
  });

  return Array.from(byEmployee.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) =>
      `- ${name}: ${data.count} comps, $${data.total.toFixed(2)} total, max $${data.maxAmount.toFixed(2)}, ${data.reasons.size} different reasons`
    ).join('\n');
})()}

### All Comps (${input.allComps.length} total)
${input.allComps.map((comp, i) => `
${i + 1}. Check ${comp.check_id} - Table ${comp.table_name}
   Employee: ${comp.server}
   Comp: $${comp.comp_total.toFixed(2)} of $${comp.check_total.toFixed(2)} (${comp.check_total > 0 ? ((comp.comp_total / comp.check_total) * 100).toFixed(0) : '0'}%)
   Reason: "${comp.reason}"
   Items: ${comp.comped_items.map(item => `${item.name} ($${item.amount.toFixed(2)})`).join(', ')}
`).join('')}

### Flagged Exceptions (${input.exceptions.exceptions.length} total)
${input.exceptions.exceptions.map((ex, i) => `
${i + 1}. ${ex.severity.toUpperCase()}: ${ex.message}
   Check ${ex.check_id} - ${ex.server} - $${ex.comp_total.toFixed(2)}
   Type: ${ex.type}
   Details: ${ex.details}
`).join('')}

## YOUR TASK

Analyze ALL comps (not just exceptions) and provide:

1. **Summary Assessment**: Overall health of comp activity
2. **Recommendations**: Prioritized, actionable items for management
3. **Insights**: Patterns, trends, or observations

### Output Format (JSON only, no markdown)

{
  "summary": {
    "totalReviewed": <number>,
    "approved": <number of comps that are legitimate and properly documented>,
    "needsFollowup": <number needing manager review>,
    "urgent": <number requiring immediate action>,
    "overallAssessment": "<2-3 sentence summary of comp health>"
  },
  "recommendations": [
    {
      "priority": "urgent" | "high" | "medium" | "low",
      "category": "violation" | "training" | "process" | "policy" | "positive",
      "title": "<Short title>",
      "description": "<What you observed>",
      "action": "<Specific action for management>",
      "relatedComps": ["<check_id>", ...]
    }
  ],
  "insights": [
    "<Pattern or observation 1>",
    "<Pattern or observation 2>",
    ...
  ]
}

## GUIDELINES

- **Be specific**: Reference check IDs, servers/managers, and amounts
- **Be actionable**: Every recommendation should have a clear next step
- **Prioritize correctly**:
  - Urgent = needs immediate action (fraud risk, major violations)
  - High = needs follow-up today (training gaps, unapproved reasons)
  - Medium = address this week (process improvements)
  - Low = note for future (positive reinforcement, minor optimizations)
- **Look for patterns**: Same server, same items, same timing
- **Validate legitimacy**: Consider context (items, reason, timing)
- **Be balanced**: Acknowledge what's going well, not just problems
- **Focus on results**: What action should management take?

## MANAGER-SPECIFIC ANALYSIS

Pay special attention to:
- **Authority levels**: Are employees comping amounts appropriate to their role?
  - Servers typically shouldn't comp >${settings.server_max_comp_amount} without manager approval
  - High-value comps ($${settings.manager_min_for_high_value}+) should be from managers (${settings.manager_roles.join(', ')})
  - Identify if servers are overstepping authority
- **Manager oversight**: Which managers need to review their team's comp activity?
- **Manager comp patterns**: Track managers who comp frequently
  - Manager Meals should be reasonable and not excessive
  - Executive/Partner comps should be documented
- **Team patterns**: If multiple servers under same manager have issues, flag for manager training
- **Approval gaps**: Identify where manager approval/oversight is missing

Include manager-specific recommendations:
- "Manager [Name] should review Server [X]'s comp documentation"
- "High-value comp needs GM approval - escalate to [Manager]"
- "Manager [Name]'s team has 3 violations - schedule training session"
- "Manager [Name] is comping appropriately - positive pattern"

Generate the JSON response now:`;
}
