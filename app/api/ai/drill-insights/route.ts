/**
 * POST /api/ai/drill-insights
 * Returns AI-generated pattern insights for a nightly report drill section.
 * Saves actionable insights to the Action Center (manager_actions table).
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDrillInsights } from '@/lib/ai/drill-insights';
import { saveDrillInsightActions } from '@/lib/database/control-plane';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { section, venueName, date, data, venueId } = body;

    if (!section || !date || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: section, date, data' },
        { status: 400 }
      );
    }

    const insights = await generateDrillInsights({
      section,
      venueName: venueName || 'Venue',
      date,
      data,
    });

    // Save non-empty insights to Action Center (non-blocking, deduped)
    let actionsCreated = 0;
    if (insights.length > 0 && venueId) {
      try {
        const result = await saveDrillInsightActions(
          venueId, date, venueName || 'Venue', section, insights
        );
        actionsCreated = result.actionsCreated;
      } catch (err: any) {
        console.error('[drill-insights] Failed to save to Action Center:', err.message);
      }
    }

    return NextResponse.json({ insights, actionsCreated });
  } catch (error: any) {
    console.error('[drill-insights API]', error.message);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
