/**
 * POST /api/ai/drill-insights
 * Returns AI-generated pattern insights for a nightly report drill section.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDrillInsights } from '@/lib/ai/drill-insights';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { section, venueName, date, data } = body;

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

    return NextResponse.json({ insights });
  } catch (error: any) {
    console.error('[drill-insights API]', error.message);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
