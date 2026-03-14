/**
 * Guest Review Signal Extractor
 *
 * Uses AI to extract employee mentions and service signals from guest reviews
 * (Google, Yelp, OpenTable, etc.) and writes them as attestation_signals
 * with signal_type = 'guest_review_mention'.
 *
 * Fuzzy-matches mentioned names to known staff who worked that date window.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase/service';
import type { GuestReview } from '@/lib/database/guest-reviews';
import { markReviewsProcessed } from '@/lib/database/guest-reviews';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ══════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════

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
  overall_rating_aligned: boolean;   // does the text sentiment match the star rating?
}

// ══════════════════════════════════════════════════════════════════════════
// Staff lookup for fuzzy matching
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get staff who worked at a venue around a review date (±3 days window).
 * Returns unique server names from pos_checks.
 */
async function getStaffAroundDate(
  venueId: string,
  reviewDate: string
): Promise<string[]> {
  const supabase = getServiceClient();

  // Look at pos_checks for servers who worked within ±3 days
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
// AI Extraction
// ══════════════════════════════════════════════════════════════════════════

function buildExtractionPrompt(
  reviews: GuestReview[],
  knownStaff: string[]
): string {
  const reviewBlock = reviews
    .map((r, i) => {
      const rating = r.rating ? `${r.rating}/5 stars` : 'no rating';
      return `[Review ${i + 1}] (${r.source}, ${rating}, ${r.review_date})
${r.review_text}`;
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

Return ONLY valid JSON, no markdown.`;
}

/**
 * Extract signals from a batch of reviews for a single venue.
 */
export async function extractReviewSignals(
  reviews: GuestReview[],
  venueId: string
): Promise<ReviewExtractionResult[]> {
  if (reviews.length === 0) return [];

  // Get known staff for fuzzy matching
  const dateRange = reviews.map(r => r.review_date).sort();
  const knownStaff = await getStaffAroundDate(
    venueId,
    dateRange[Math.floor(dateRange.length / 2)] // median date
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

  const parsed = JSON.parse(textContent.text) as Array<{
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
 * mark reviews as processed.
 */
export async function processReviewSignals(
  venueId: string,
  reviews: GuestReview[]
): Promise<{ signals_created: number; reviews_processed: number }> {
  if (reviews.length === 0) return { signals_created: 0, reviews_processed: 0 };

  const results = await extractReviewSignals(reviews, venueId);
  const supabase = getServiceClient();
  let signalsCreated = 0;
  const processedIds: string[] = [];

  for (const result of results) {
    for (const signal of result.signals) {
      const row = {
        venue_id: venueId,
        business_date: reviews.find(r => r.id === result.review_id)?.review_date,
        signal_type: 'guest_review_mention',
        extracted_text: signal.extracted_text,
        source_field: `guest_review_${reviews.find(r => r.id === result.review_id)?.source || 'unknown'}`,
        confidence: signal.confidence,
        entity_name: signal.matched_server || signal.server_name_raw || null,
        entity_type: 'server', // default; could be refined
        mention_sentiment: signal.sentiment,
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
    }

    processedIds.push(result.review_id);
  }

  await markReviewsProcessed(processedIds);

  return {
    signals_created: signalsCreated,
    reviews_processed: processedIds.length,
  };
}
