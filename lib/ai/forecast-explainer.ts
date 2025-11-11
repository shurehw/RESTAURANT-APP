/**
 * AI-Powered Forecast Explanation Layer
 * Uses Claude API to generate natural language explanations for managers
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ForecastChange {
  originalCovers: number;
  newCovers: number;
  originalRevenue: number;
  newRevenue: number;
  variancePercentage: number;
  date: string;
  dayOfWeek: string;

  factors: {
    weatherChange?: {
      old: { temp: number; conditions: string };
      new: { temp: number; conditions: string };
    };
    reservationsChange?: {
      old: number;
      new: number;
    };
    eventsChange?: {
      added?: string[];
      removed?: string[];
    };
    historicalPattern?: string;
  };
}

export interface AdjustmentRecommendation {
  type: 'cut' | 'add';
  employeeName: string;
  position: string;
  savings: number;
  penalty: number;
  netBenefit: number;
  hoursUntilShift: number;
  reason: string;
}

/**
 * Generate natural language explanation for why a forecast changed
 */
export async function explainForecastChange(
  change: ForecastChange
): Promise<string> {
  const prompt = `You are an AI assistant helping restaurant managers understand demand forecast changes.

FORECAST CHANGE:
- Date: ${change.dayOfWeek}, ${change.date}
- Original forecast: ${change.originalCovers} covers, $${change.originalRevenue.toFixed(0)} revenue
- New forecast: ${change.newCovers} covers, $${change.newRevenue.toFixed(0)} revenue
- Change: ${change.variancePercentage > 0 ? '+' : ''}${change.variancePercentage.toFixed(1)}%

CONTRIBUTING FACTORS:
${change.factors.weatherChange ? `
- Weather: ${change.factors.weatherChange.old.conditions} ${change.factors.weatherChange.old.temp}°F → ${change.factors.weatherChange.new.conditions} ${change.factors.weatherChange.new.temp}°F
` : ''}
${change.factors.reservationsChange ? `
- Reservations: ${change.factors.reservationsChange.old} → ${change.factors.reservationsChange.new} bookings (${change.factors.reservationsChange.new - change.factors.reservationsChange.old > 0 ? '+' : ''}${change.factors.reservationsChange.new - change.factors.reservationsChange.old})
` : ''}
${change.factors.eventsChange?.added?.length ? `
- New events detected: ${change.factors.eventsChange.added.join(', ')}
` : ''}
${change.factors.eventsChange?.removed?.length ? `
- Events cancelled: ${change.factors.eventsChange.removed.join(', ')}
` : ''}
${change.factors.historicalPattern ? `
- Pattern: ${change.factors.historicalPattern}
` : ''}

Write a clear, concise 2-3 sentence explanation for the manager. Be direct and actionable. Focus on WHY it changed and what it means for staffing.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  return textContent?.type === 'text' ? textContent.text : '';
}

/**
 * Generate daily forecast briefing summary
 */
export async function generateDailyBriefing(data: {
  venueName: string;
  reviewDate: string;
  upcomingForecasts: Array<{
    date: string;
    dayOfWeek: string;
    shift: string;
    covers: number;
    revenue: number;
    confidence: number;
    laborCost: number;
    laborPercentage: number;
  }>;
  adjustments: AdjustmentRecommendation[];
  totalPotentialSavings: number;
}): Promise<string> {
  const prompt = `You are an AI assistant creating a daily forecast review briefing for restaurant managers.

VENUE: ${data.venueName}
REVIEW DATE: ${data.reviewDate}

UPCOMING FORECASTS (Next 3 Days):
${data.upcomingForecasts
  .map(
    (f) =>
      `${f.dayOfWeek}, ${f.date} - ${f.shift}:
  • ${f.covers} covers (${f.confidence}% confidence)
  • $${f.revenue.toFixed(0)} revenue
  • $${f.laborCost.toFixed(0)} labor (${f.laborPercentage.toFixed(1)}% of revenue)`
  )
  .join('\n\n')}

RECOMMENDED ADJUSTMENTS:
${
  data.adjustments.length > 0
    ? data.adjustments
        .map(
          (adj, i) =>
            `${i + 1}. ${adj.type === 'cut' ? 'CUT' : 'ADD'} ${adj.employeeName} (${adj.position})
   • Reason: ${adj.reason}
   • Net benefit: $${adj.netBenefit.toFixed(0)}
   • ${adj.hoursUntilShift.toFixed(1)} hours until shift`
        )
        .join('\n\n')
    : 'No adjustments needed - forecasts are stable'
}

TOTAL POTENTIAL SAVINGS: $${data.totalPotentialSavings.toFixed(0)}

Generate a concise, actionable briefing email for the manager. Include:
1. A brief overview (2-3 sentences)
2. Key highlights or concerns
3. Clear next steps

Use a professional but friendly tone. Be direct. Format with clear sections.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  return textContent?.type === 'text' ? textContent.text : '';
}

/**
 * Answer manager question about forecast/schedule
 */
export async function answerManagerQuestion(
  question: string,
  context: {
    todaysForecast?: {
      covers: number;
      revenue: number;
      scheduledStaff: number;
      currentStaff: number;
    };
    upcomingShifts?: Array<{
      date: string;
      covers: number;
      scheduled: number;
    }>;
  }
): Promise<string> {
  const contextStr = JSON.stringify(context, null, 2);

  const prompt = `You are an AI assistant helping a restaurant manager make labor decisions.

MANAGER QUESTION: "${question}"

CURRENT CONTEXT:
${contextStr}

Provide a clear, actionable answer. Be concise (2-4 sentences). If recommending a decision, explain the reasoning briefly. If you need more information, say so.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  return textContent?.type === 'text' ? textContent.text : '';
}

/**
 * Generate smart adjustment recommendation explanation
 */
export async function explainAdjustmentRecommendation(
  adjustment: AdjustmentRecommendation & {
    forecastChange: ForecastChange;
  }
): Promise<string> {
  const prompt = `You are an AI assistant helping a restaurant manager understand a schedule adjustment recommendation.

RECOMMENDATION: ${adjustment.type === 'cut' ? 'CUT' : 'ADD'} ${adjustment.employeeName} (${adjustment.position})

FORECAST CHANGE:
- Original: ${adjustment.forecastChange.originalCovers} covers
- New: ${adjustment.forecastChange.newCovers} covers
- Variance: ${adjustment.forecastChange.variancePercentage > 0 ? '+' : ''}${adjustment.forecastChange.variancePercentage.toFixed(1)}%

FINANCIAL IMPACT:
- Labor ${adjustment.type === 'cut' ? 'savings' : 'cost'}: $${Math.abs(adjustment.savings).toFixed(0)}
- Penalty cost: $${adjustment.penalty.toFixed(0)}
- Net benefit: $${adjustment.netBenefit.toFixed(0)}

TIMING:
- ${adjustment.hoursUntilShift.toFixed(1)} hours until shift

REASON: ${adjustment.reason}

Write a clear 2-3 sentence explanation for why this adjustment makes sense (or doesn't). Include the key financial tradeoff and timing consideration.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  return textContent?.type === 'text' ? textContent.text : '';
}
