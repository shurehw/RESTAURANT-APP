/**
 * POST /api/reviews/ingest
 *
 * Ingests guest reviews from external platforms (Google, Yelp, OpenTable).
 * Can be called by a cron job that scrapes/fetches reviews, or manually.
 *
 * Auth: CRON_SECRET for automated ingestion, or resolveContext for manual.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { ingestReviews, type IngestReviewInput } from '@/lib/database/guest-reviews';

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
    const { reviews } = body as { reviews: IngestReviewInput[] };

    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json(
        { error: 'reviews array is required' },
        { status: 400 }
      );
    }

    // Validate each review
    for (const review of reviews) {
      if (!review.venue_id || !review.source || !review.review_text || !review.review_date) {
        return NextResponse.json(
          { error: 'Each review requires venue_id, source, review_text, and review_date' },
          { status: 400 }
        );
      }
    }

    const result = await ingestReviews(reviews);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Review ingestion error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
