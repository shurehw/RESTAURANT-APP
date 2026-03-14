/**
 * POST /api/reviews/process
 *
 * Processes unprocessed guest reviews through AI signal extraction.
 * Extracts employee mentions, sentiment, and service quality signals
 * and writes them to attestation_signals as 'guest_review_mention'.
 *
 * Designed to run after review ingestion (cron or manual trigger).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUnprocessedReviews } from '@/lib/database/guest-reviews';
import { processReviewSignals } from '@/lib/ai/review-signal-extractor';

export async function POST(request: NextRequest) {
  try {
    // Auth: either CRON_SECRET or authenticated user
    const authHeader = request.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const ctx = await resolveContext();
      if (!ctx?.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { venue_id, limit = 50 } = body;

    if (!venue_id) {
      return NextResponse.json(
        { error: 'venue_id is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI processing not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 }
      );
    }

    const reviews = await getUnprocessedReviews(venue_id, limit);

    if (reviews.length === 0) {
      return NextResponse.json({
        success: true,
        data: { signals_created: 0, reviews_processed: 0, message: 'No unprocessed reviews' },
      });
    }

    const result = await processReviewSignals(venue_id, reviews);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Review processing error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
