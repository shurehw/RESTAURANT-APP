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
    const { date, venueName, server, teamAverages, venueId, periodLabel } = body;

    if (!date || !server || !teamAverages) {
      return NextResponse.json(
        { error: 'date, server, and teamAverages are required' },
        { status: 400 }
      );
    }

    const reviewInput: ServerReviewInput = {
      date,
      venueName: venueName || 'Unknown Venue',
      periodLabel: periodLabel || 'Tonight',
      server,
      teamAverages,
    };

    const review = await reviewServerPerformance(reviewInput);

    // Save coaching actions to Control Plane only for end-of-period reviews
    // (single shifts don't provide enough data for actionable coaching items)
    if (venueId && periodLabel === 'Period to Date') {
      try {
        const { saveServerCoachingActions } = await import('@/lib/database/control-plane');
        const actionResult = await saveServerCoachingActions(
          venueId,
          date,
          venueName || 'Unknown Venue',
          server.employee_name,
          review
        );

        if (!actionResult.success) {
          console.error('Failed to save some coaching actions:', actionResult.errors);
        }
      } catch (actionError) {
        console.error('Error saving coaching actions to Control Plane:', actionError);
      }
    }

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
