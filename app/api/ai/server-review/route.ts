/**
 * AI Server Performance Review API
 * On-demand coaching feedback for individual servers
 */

import { NextRequest, NextResponse } from 'next/server';
import { reviewServerPerformance, type ServerReviewInput } from '@/lib/ai/server-reviewer';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI server review not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { date, venueName, server, teamAverages } = body;

    if (!date || !server || !teamAverages) {
      return NextResponse.json(
        { error: 'date, server, and teamAverages are required' },
        { status: 400 }
      );
    }

    const reviewInput: ServerReviewInput = {
      date,
      venueName: venueName || 'Unknown Venue',
      server,
      teamAverages,
    };

    const review = await reviewServerPerformance(reviewInput);

    return NextResponse.json({
      success: true,
      data: review,
    });
  } catch (error: any) {
    console.error('AI Server Review API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
