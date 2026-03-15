/**
 * Guest Review Signal Extractor
 *
 * Uses AI to extract employee mentions and service signals from guest reviews
 * stored in `reviews_raw` (synced from TipSee/Widewail every 6 hours).
 *
 * Writes extracted signals to `attestation_signals` with signal_type = 'guest_review_mention'.
 * Fuzzy-matches mentioned names to known staff who worked that date window.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase/service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ══════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════

export interface RawReview {
  id: string;
  source_review_id: string;
  source: string;
  venue_id: string;
  rating: number | null;
  reviewed_at: string;
  tags: string[];
  content: string | null;
  tipsee_id: number | null;
}

export interface ReviewSignal {
  server_name_raw: string | null;    // name as written in review
  matched_server: string | null;     // matched to known staff
  sentiment: 'positive' | 'negative' | 'neutral';
  context: string;                   // 1-2 sentence summary
  extracted_text: string;            // exact quote from review
  service_aspects: string[];         // e.g., ['speed', 'friendliness', 'knowledge']
  confidence: number;
}

export interface ReviewExtractionResult {
  review_id: string;
  signals: ReviewSignal[];
  overall_sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
  overall_rating_aligned: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// Staff lookup for fuzzy matching
// ══════════════════════════════════════════════════════════════════════════

async function getStaffAroundDate(
  venueId: string,
  reviewDate: string
): Promise<string[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('pos_checks')
    .select('server_name')
    .eq('venue_id', venueId)
    .gte('business_date', shiftDate(reviewDate, -3))
    .lte('business_date', shiftDate(reviewDate, 3))
    .not('server_name', 'is', null);

  if (error) {
    console.error('Failed to fetch staff for matching:', error.message);
    return [];
  }

  const names = new Set<string>();
  for (const row of data || []) {
    if (row.server_name) names.add(row.server_name);
  }
  return Array.from(names);
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════════════════════════════════
// Fetch unprocessed reviews from reviews_raw
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get reviews that have content but haven't been signal-extracted yet.
 * We track processed status via a content_hash check against existing signals.
 */
export async function getUnprocessedReviews(
  venueId: string,
  limit = 50
): Promise<RawReview[]> {
  const supabase = getServiceClient();

  // Get reviews that have content and no matching signal yet
  const { data, error } = await (supabase as any)
    .from('reviews_raw')
    .select('id, source_review_id, source, venue_id, rating, reviewed_at, tags, content, tipsee_id')
    .eq('venue_id', venueId)
    .not('content', 'is', null)
    .order('reviewed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch reviews:', error.message);
    return [];
  }

  if (!data?.length) return [];

  // Filter out reviews that already have signals extracted
  const reviewIds = data.map((r: any) => r.id);
  const { data: existingSignals } = await (supabase as any)
    .from('attestation_signals')
    .select('guest_review_id')
    .eq('signal_type', 'guest_review_mention')
    .in('guest_review_id', reviewIds);

  const processedIds = new Set((existingSignals || []).map((s: any) => s.guest_review_id));

  return (data as RawReview[]).filter(r => !processedIds.has(r.id));
}

// ══════════════════════════════════════════════════════════════════════════
// AI Extraction
// ══════════════════════════════════════════════════════════════════════════

function buildExtractionPrompt(
  reviews: RawReview[],
  knownStaff: string[]
): string {
  const reviewBlock = reviews
    .map((r, i) => {
      const rating = r.rating ? `${r.rating}/5 stars` : 'no rating';
      const tags = r.tags?.length ? ` [tags: ${r.tags.join(', ')}]` : '';
      return `[Review ${i + 1}] (${r.source}, ${rating}, ${r.reviewed_at.split('T')[0]})${tags}
${r.content}`;
    })
    .join('\n\n---\n\n');

  const staffBlock = knownStaff.length > 0
    ? `\nKnown staff who worked around these dates: ${knownStaff.join(', ')}`
    : '\nNo known staff list available — extract names as-is from the review text.';

  return `You are a restaurant operations analyst. Extract employee/service mentions from guest reviews.
${staffBlock}

REVIEWS:

${reviewBlock}

For each review, extract:

1. **Employee mentions** — guests naming or describing a specific server/bartender/host. Look for:
   - Explicit names: "Our server Marcus was amazing"
   - Role references that can be matched: "our waiter", "the bartender", "the hostess"
   - For role-only references (no name), set server_name_raw to null

2. **Service quality signals** — what aspects of service were praised or criticized:
   - speed: wait times, how fast food/drinks arrived
   - friendliness: warmth, attentiveness, personality
   - knowledge: menu knowledge, recommendations, wine expertise
   - attentiveness: checking in, refills, anticipating needs
   - professionalism: handling complaints, composure, appearance

3. **Fuzzy name matching** — if the guest writes "Mark" and known staff includes "Marcus Williams", set matched_server to "Marcus Williams". Only match if you're reasonably confident. If no match, set matched_server to null.

Return JSON array (one entry per review):

[
  {
    "review_index": 1,
    "overall_sentiment": "positive" | "negative" | "mixed" | "neutral",
    "overall_rating_aligned": true | false,
    "signals": [
      {
        "server_name_raw": "Marcus" | null,
        "matched_server": "Marcus Williams" | null,
        "sentiment": "positive" | "negative" | "neutral",
        "context": "Guest praised server for exceptional wine recommendations and attentiveness",
        "extracted_text": "Our server Marcus was incredible — he knew every wine on the list",
        "service_aspects": ["knowledge", "friendliness"],
        "confidence": 0.9
      }
    ]
  }
]

Rules:
- Only extract signals where a staff member is specifically mentioned or described. Generic "great food" with no service mention = no signals.
- For negative reviews that mention slow service without naming anyone, still extract a signal with server_name_raw: null. The system will try to match by shift data.
- Keep extracted_text as a direct quote from the review, not a summary.
- confidence: 0.9+ for explicit name match, 0.7-0.9 for fuzzy match, 0.5-0.7 for role-only attribution.
- If a review has no service mentions at all, return empty signals array.

Return ONLY valid JSON, no markdown.`;
}

export async function extractReviewSignals(
  reviews: RawReview[],
  venueId: string
): Promise<ReviewExtractionResult[]> {
  if (reviews.length === 0) return [];

  const dateRange = reviews.map(r => r.reviewed_at.split('T')[0]).sort();
  const knownStaff = await getStaffAroundDate(
    venueId,
    dateRange[Math.floor(dateRange.length / 2)]
  );

  const prompt = buildExtractionPrompt(reviews, knownStaff);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = message.content.find(b => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI for review signal extraction');
  }

  // Strip markdown code fences if model wraps response
  const rawText = textContent.text.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  const parsed = JSON.parse(rawText) as Array<{
    review_index: number;
    overall_sentiment: string;
    overall_rating_aligned: boolean;
    signals: ReviewSignal[];
  }>;

  return parsed.map((entry, i) => ({
    review_id: reviews[entry.review_index - 1]?.id || reviews[i]?.id || '',
    signals: entry.signals || [],
    overall_sentiment: entry.overall_sentiment as any,
    overall_rating_aligned: entry.overall_rating_aligned,
  }));
}

// ══════════════════════════════════════════════════════════════════════════
// Save signals to attestation_signals table
// ══════════════════════════════════════════════════════════════════════════

/**
 * Process unprocessed reviews: extract signals via AI, save to attestation_signals,
 * and generate manager actions for negative reviews.
 */
export async function processReviewSignals(
  venueId: string,
  reviews: RawReview[]
): Promise<{ signals_created: number; reviews_processed: number; actions_created: number }> {
  if (reviews.length === 0) return { signals_created: 0, reviews_processed: 0, actions_created: 0 };

  const results = await extractReviewSignals(reviews, venueId);
  const supabase = getServiceClient();
  let signalsCreated = 0;
  let actionsCreated = 0;

  // Get venue name for actions
  const { data: venue } = await (supabase as any)
    .from('venues')
    .select('name')
    .eq('id', venueId)
    .single();
  const venueName = venue?.name || '';

  for (const result of results) {
    const review = reviews.find(r => r.id === result.review_id);
    const reviewDate = review?.reviewed_at?.split('T')[0];

    for (const signal of result.signals) {
      // Map sentiment to valid enum values (AI sometimes returns 'mixed')
      const validSentiments = ['positive', 'negative', 'neutral', 'actionable'];
      const sentiment = validSentiments.includes(signal.sentiment) ? signal.sentiment : 'neutral';

      const row = {
        venue_id: venueId,
        business_date: reviewDate,
        signal_type: 'guest_review_mention',
        extracted_text: signal.extracted_text,
        source_field: `guest_review_${review?.source?.toLowerCase() || 'unknown'}`,
        confidence: signal.confidence,
        entity_name: signal.matched_server || signal.server_name_raw || null,
        entity_type: 'server',
        mention_sentiment: sentiment,
        mention_context: signal.context,
        guest_review_id: result.review_id,
      };

      const { error } = await (supabase as any)
        .from('attestation_signals')
        .insert(row);

      if (error) {
        console.error('Failed to insert review signal:', error.message);
      } else {
        signalsCreated++;
      }

      // Generate actions for negative signals
      if (signal.sentiment === 'negative') {
        const action = buildReviewAction(venueId, venueName, reviewDate || '', review, signal);
        if (action) {
          const { error: actionError } = await (supabase as any)
            .from('manager_actions')
            .insert(action);
          if (!actionError) actionsCreated++;
        }
      }
    }

    // Generate action for overall negative reviews (1-2 stars) even without specific server mention
    if (result.overall_sentiment === 'negative' && result.signals.length === 0 && review) {
      const rating = review.rating;
      if (rating != null && rating <= 2) {
        const action = {
          venue_id: venueId,
          business_date: reviewDate,
          source_report: `guest_review_${reviewDate}`,
          source_type: 'guest_review',
          priority: rating <= 1 ? 'high' as const : 'medium' as const,
          category: 'process',
          title: `Negative ${review.source} review (${rating}/5)`,
          description: truncate(review.content || '', 300),
          action: 'Review this guest feedback and identify what went wrong. Discuss in pre-shift.',
          assigned_role: 'manager',
          metadata: {
            venue_name: venueName,
            ai_generated: true,
            review_source: review.source,
            review_rating: rating,
            review_id: review.id,
          },
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const { error: actionError } = await (supabase as any)
          .from('manager_actions')
          .insert(action);
        if (!actionError) actionsCreated++;
      }
    }
  }

  return {
    signals_created: signalsCreated,
    reviews_processed: results.length,
    actions_created: actionsCreated,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Action builders
// ══════════════════════════════════════════════════════════════════════════

function buildReviewAction(
  venueId: string,
  venueName: string,
  reviewDate: string,
  review: RawReview | undefined,
  signal: ReviewSignal
): Record<string, any> | null {
  const serverName = signal.matched_server || signal.server_name_raw;
  const source = review?.source || 'unknown';
  const rating = review?.rating;

  const aspects = signal.service_aspects.length > 0
    ? signal.service_aspects.join(', ')
    : 'service quality';

  return {
    venue_id: venueId,
    business_date: reviewDate,
    source_report: `guest_review_${reviewDate}`,
    source_type: 'guest_review',
    priority: (rating != null && rating <= 1) ? 'high' : 'medium',
    category: 'training',
    title: serverName
      ? `Guest complaint about ${serverName} (${source})`
      : `Guest complaint: ${aspects} (${source})`,
    description: `"${truncate(signal.extracted_text, 200)}" — ${signal.context}`,
    action: serverName
      ? `Address ${aspects} feedback with ${serverName} before their next shift.`
      : `Investigate ${aspects} issues from ${reviewDate}. Check who was working and address in pre-shift.`,
    assigned_role: 'manager',
    related_employees: serverName ? [serverName] : [],
    metadata: {
      venue_name: venueName,
      ai_generated: true,
      review_source: source,
      review_rating: rating,
      review_id: review?.id,
      service_aspects: signal.service_aspects,
    },
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
