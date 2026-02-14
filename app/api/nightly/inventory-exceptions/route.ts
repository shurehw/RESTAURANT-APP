/**
 * Nightly Inventory Exception Detection
 *
 * GET /api/nightly/inventory-exceptions?date=YYYY-MM-DD
 *
 * Called by an external scheduler (QStash, cron-job.org, etc.)
 * Detects inventory/procurement anomalies across all active venues:
 *   - Cost spikes (z-score on item_cost_history)
 *   - Unresolved invoice variances
 *   - Inventory shrink (count vs balance)
 *   - Recipe cost drift
 *   - Par level violations
 *
 * Writes signals to the feedback spine and creates feedback objects
 * for warning/critical exceptions. These flow into carry-forward,
 * preshift, and the verification loop automatically.
 *
 * Auth: x-cron-secret header or Bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  detectAllInventoryExceptions,
  type CostSpikeException,
  type InvoiceVarianceException,
  type InventoryShrinkException,
  type RecipeCostDriftException,
  type ParLevelViolationException,
} from '@/lib/database/inventory-exceptions';
import { getActiveProcurementSettings, type ProcurementSettings } from '@/lib/database/procurement-settings';
import {
  writeSignals,
  type SignalInput,
} from '@/lib/feedback/signal-writer';
import {
  generateCostSpikeFeedback,
  generateInvoiceVarianceFeedback,
  generateShrinkFeedback,
  generateRecipeDriftFeedback,
  generateParViolationFeedback,
} from '@/lib/feedback/inventory-feedback-generator';

const CRON_SECRET = process.env.CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

interface VenueResult {
  venue_id: string;
  org_id: string;
  signals_written: number;
  feedback_created: number;
  exceptions: {
    cost_spikes: number;
    invoice_variances: number;
    shrink: number;
    recipe_drift: number;
    par_violations: number;
  };
  errors: string[];
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const dateParam = request.nextUrl.searchParams.get('date');

  // Resolve business date (default: yesterday, before 5 AM = 2 days ago)
  let businessDate: string;
  if (dateParam) {
    businessDate = dateParam;
  } else {
    const now = new Date();
    now.setDate(now.getDate() - 1); // yesterday
    if (now.getHours() < 5) {
      now.setDate(now.getDate() - 1);
    }
    businessDate = now.toISOString().split('T')[0];
  }

  try {
    // Fetch all active venues with their org
    const supabase = getServiceClient();
    const { data: venues, error: venueErr } = await (supabase as any)
      .from('venues')
      .select('id, organization_id')
      .eq('is_active', true);

    if (venueErr) {
      throw new Error(`Failed to fetch venues: ${venueErr.message}`);
    }

    if (!venues || venues.length === 0) {
      return NextResponse.json({
        success: true,
        business_date: businessDate,
        duration_ms: Date.now() - start,
        venues_processed: 0,
        total_signals: 0,
        total_feedback: 0,
        venues: [],
      });
    }

    // Process each venue in parallel
    const results = await Promise.allSettled(
      venues.map((venue: any) =>
        processVenue(venue.id, venue.organization_id, businessDate)
      )
    );

    const venueResults: VenueResult[] = [];
    let totalSignals = 0;
    let totalFeedback = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        venueResults.push(result.value);
        totalSignals += result.value.signals_written;
        totalFeedback += result.value.feedback_created;
      } else {
        venueResults.push({
          venue_id: 'unknown',
          org_id: 'unknown',
          signals_written: 0,
          feedback_created: 0,
          exceptions: { cost_spikes: 0, invoice_variances: 0, shrink: 0, recipe_drift: 0, par_violations: 0 },
          errors: [result.reason?.message || 'Unknown error'],
        });
      }
    }

    return NextResponse.json({
      success: true,
      business_date: businessDate,
      duration_ms: Date.now() - start,
      venues_processed: venues.length,
      total_signals: totalSignals,
      total_feedback: totalFeedback,
      venues: venueResults,
    });
  } catch (err: any) {
    console.error('[Inventory Exceptions] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Internal error',
        duration_ms: Date.now() - start,
      },
      { status: 500 }
    );
  }
}

// ── Per-Venue Processing ────────────────────────────────────────

async function processVenue(
  venueId: string,
  orgId: string,
  businessDate: string
): Promise<VenueResult> {
  const errors: string[] = [];
  let signalsWritten = 0;
  let feedbackCreated = 0;

  // Step 0: Fetch org procurement settings (cached, falls back to defaults)
  const settings = await getActiveProcurementSettings(orgId);

  // Step 1: Detect all exceptions using org-calibrated thresholds
  const exceptions = await detectAllInventoryExceptions(venueId, businessDate, settings);

  const exceptionCounts = {
    cost_spikes: exceptions.cost_spikes.length,
    invoice_variances: exceptions.invoice_variances.length,
    shrink: exceptions.shrink_exceptions.length,
    recipe_drift: exceptions.recipe_drift.length,
    par_violations: exceptions.par_violations.length,
  };

  // Step 2: Build signals from exceptions
  const signalInputs: SignalInput[] = [];

  // Cost spike signals
  for (const spike of exceptions.cost_spikes) {
    signalInputs.push({
      orgId,
      venueId,
      businessDate,
      domain: 'procurement',
      signalType: 'cost_spike',
      source: 'rule',
      severity: Math.abs(spike.z_score) > 3 ? 'critical' : 'warning',
      impactValue: Math.abs(spike.new_cost - spike.avg_cost),
      impactUnit: 'usd',
      entityType: 'item',
      entityId: spike.item_id,
      dedupeKey: `procurement:cost_spike:item:${spike.item_id}:${businessDate}`,
      payload: {
        item_name: spike.item_name,
        vendor_name: spike.vendor_name,
        new_cost: spike.new_cost,
        avg_cost: spike.avg_cost,
        z_score: spike.z_score,
        variance_pct: spike.variance_pct,
      },
    });
  }

  // Invoice variance signals
  for (const iv of exceptions.invoice_variances) {
    signalInputs.push({
      orgId,
      venueId,
      businessDate,
      domain: 'procurement',
      signalType: 'invoice_variance_unresolved',
      source: 'rule',
      severity: iv.severity === 'critical' ? 'critical' : 'warning',
      impactValue: Math.abs(iv.total_variance_amount),
      impactUnit: 'usd',
      entityType: 'invoice',
      entityId: iv.invoice_id,
      dedupeKey: `procurement:invoice_variance_unresolved:invoice:${iv.invoice_id}:${iv.variance_type}`,
      payload: {
        invoice_number: iv.invoice_number,
        vendor_name: iv.vendor_name,
        variance_type: iv.variance_type,
        line_count: iv.line_count,
        variance_pct: iv.variance_pct,
      },
    });
  }

  // Shrink signals
  for (const shrink of exceptions.shrink_exceptions) {
    signalInputs.push({
      orgId,
      venueId,
      businessDate,
      domain: 'procurement',
      signalType: 'inventory_shrink_high',
      source: 'rule',
      severity: shrink.total_shrink_cost >= settings.shrink_cost_critical ? 'critical' : 'warning',
      impactValue: shrink.total_shrink_cost,
      impactUnit: 'usd',
      entityType: 'count',
      entityId: shrink.count_id,
      dedupeKey: `procurement:inventory_shrink_high:count:${shrink.count_id}`,
      payload: {
        count_date: shrink.count_date,
        shrink_pct: shrink.shrink_pct,
        item_count: shrink.high_shrink_items.length,
        top_items: shrink.high_shrink_items.slice(0, 3).map(i => i.item_name),
      },
    });
  }

  // Recipe drift signals
  for (const drift of exceptions.recipe_drift) {
    signalInputs.push({
      orgId,
      venueId,
      businessDate,
      domain: 'procurement',
      signalType: 'recipe_cost_drift',
      source: 'rule',
      severity: Math.abs(drift.drift_pct) >= settings.recipe_drift_critical_pct ? 'critical' : 'warning',
      impactValue: Math.abs(drift.current_cost - drift.previous_cost),
      impactUnit: 'usd',
      entityType: 'recipe',
      entityId: drift.recipe_id,
      dedupeKey: `procurement:recipe_cost_drift:recipe:${drift.recipe_id}:${businessDate}`,
      payload: {
        recipe_name: drift.recipe_name,
        current_cost: drift.current_cost,
        previous_cost: drift.previous_cost,
        drift_pct: drift.drift_pct,
      },
    });
  }

  // Par violation signals
  for (const par of exceptions.par_violations) {
    signalInputs.push({
      orgId,
      venueId,
      businessDate,
      domain: 'procurement',
      signalType: 'par_level_violation',
      source: 'rule',
      severity: 'warning',
      impactValue: par.estimated_order_cost,
      impactUnit: 'usd',
      entityType: 'item',
      entityId: par.item_id,
      dedupeKey: `procurement:par_level_violation:item:${par.item_id}:${businessDate}`,
      payload: {
        item_name: par.item_name,
        quantity_on_hand: par.quantity_on_hand,
        reorder_point: par.reorder_point,
        deficit: par.deficit,
      },
    });
  }

  // Step 3: Write signals (batch with dedup)
  if (signalInputs.length > 0) {
    try {
      const written = await writeSignals(signalInputs);
      signalsWritten = written.length;
    } catch (err: any) {
      errors.push(`Signal write failed: ${err.message}`);
    }
  }

  // Step 4: Create feedback objects for warning/critical exceptions
  // We pass signal IDs when we have them, but since dedup may filter some,
  // we pass empty arrays for signal linking (feedback objects are still valuable without signal links)
  try {
    const [costFb, ivFb, shrinkFb, recipeFb, parFb] = await Promise.allSettled([
      exceptions.cost_spikes.length > 0
        ? generateCostSpikeFeedback({
            orgId,
            venueId,
            businessDate,
            exceptions: exceptions.cost_spikes,
            signalIds: [],
          })
        : Promise.resolve([]),
      exceptions.invoice_variances.length > 0
        ? generateInvoiceVarianceFeedback({
            orgId,
            venueId,
            businessDate,
            exceptions: exceptions.invoice_variances,
            signalIds: [],
          })
        : Promise.resolve([]),
      exceptions.shrink_exceptions.length > 0
        ? generateShrinkFeedback({
            orgId,
            venueId,
            businessDate,
            exceptions: exceptions.shrink_exceptions,
            signalIds: [],
          })
        : Promise.resolve([]),
      exceptions.recipe_drift.length > 0
        ? generateRecipeDriftFeedback({
            orgId,
            venueId,
            businessDate,
            exceptions: exceptions.recipe_drift,
            signalIds: [],
          })
        : Promise.resolve([]),
      exceptions.par_violations.length > 5 // only create feedback for >5 items (warning+)
        ? generateParViolationFeedback({
            orgId,
            venueId,
            businessDate,
            exceptions: exceptions.par_violations,
            signalIds: [],
          })
        : Promise.resolve([]),
    ]);

    const fbResults = [costFb, ivFb, shrinkFb, recipeFb, parFb];
    for (const r of fbResults) {
      if (r.status === 'fulfilled') {
        feedbackCreated += r.value.length;
      } else {
        errors.push(`Feedback generation failed: ${r.reason?.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Feedback generation failed: ${err.message}`);
  }

  return {
    venue_id: venueId,
    org_id: orgId,
    signals_written: signalsWritten,
    feedback_created: feedbackCreated,
    exceptions: exceptionCounts,
    errors,
  };
}
