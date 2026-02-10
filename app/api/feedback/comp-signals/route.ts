/**
 * Comp Signals API - Detects comp exceptions and writes signals + feedback objects
 *
 * This endpoint integrates the existing comp exception detector with the
 * new feedback spine. It's called nightly after TipSee sync to generate
 * signals and feedback objects for comp activity.
 *
 * Flow:
 * 1. Detect comp exceptions (using existing logic)
 * 2. Write signals for each exception
 * 3. Generate feedback objects from signals
 *
 * Usage: POST /api/feedback/comp-signals?date=2026-02-09&venue=uuid
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchCompExceptions } from '@/lib/database/tipsee';
import { getCompSettingsForVenue } from '@/lib/database/comp-settings';
import { writeSignals, type SignalInput } from '@/lib/feedback/signal-writer';
import { generateCompFeedback } from '@/lib/feedback/feedback-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const venueId = searchParams.get('venue');

    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'Missing required parameters: date, venue' },
        { status: 400 }
      );
    }

    // Get org ID and venue mapping (TODO: fetch from database)
    // For now, hardcoding to match existing venues
    const orgId = 'f59afbc0-7dc7-4fcc-bb98-9d82c8bb5e5e'; // h.wood Group

    // Fetch comp settings for this venue
    const settings = await getCompSettingsForVenue(venueId);

    // Detect comp exceptions using existing logic
    const exceptions = await fetchCompExceptions(date, venueId, settings ?? undefined);

    if (exceptions.exceptions.length === 0) {
      return NextResponse.json({
        success: true,
        date,
        venueId,
        signalsCreated: 0,
        feedbackObjectsCreated: 0,
        message: 'No comp exceptions detected',
      });
    }

    // Convert exceptions to signals
    const signals: SignalInput[] = exceptions.exceptions.map(exc => {
      let signalType = 'comp_unapproved_reason';
      let severity: 'info' | 'warning' | 'critical' = 'warning';

      if (exc.type === 'unapproved_reason') {
        signalType = 'comp_unapproved_reason';
        severity = 'critical';
      } else if (exc.type === 'high_value') {
        signalType = 'comp_high_value';
        severity = 'critical';
      } else if (exc.type === 'high_comp_pct') {
        signalType = 'comp_high_pct_of_check';
        severity = 'warning';
      }

      return {
        orgId,
        venueId,
        businessDate: date,
        domain: 'revenue' as const,
        signalType,
        source: 'rule' as const,
        severity,
        impactValue: exc.comp_total,
        impactUnit: 'usd',
        entityType: 'check',
        entityId: exc.check_id,
        payload: {
          check_id: exc.check_id,
          table_name: exc.table_name,
          server: exc.server,
          comp_total: exc.comp_total,
          check_total: exc.check_total,
          reason: exc.reason,
          message: exc.message,
          details: exc.details,
        },
      };
    });

    // Add daily budget signal if comp % is at warning or critical level
    if (exceptions.summary.comp_pct_status !== 'ok') {
      signals.push({
        orgId,
        venueId,
        businessDate: date,
        domain: 'revenue' as const,
        signalType: 'comp_daily_budget_exceeded',
        source: 'rule' as const,
        severity: exceptions.summary.comp_pct_status === 'critical' ? 'critical' : 'warning',
        impactValue: exceptions.summary.total_comps,
        impactUnit: 'usd',
        entityType: 'check',
        entityId: `daily-${date}-${venueId}`,
        payload: {
          comp_pct: exceptions.summary.comp_pct,
          total_comps: exceptions.summary.total_comps,
          net_sales: exceptions.summary.net_sales,
          comp_pct_status: exceptions.summary.comp_pct_status,
        },
      });
    }

    // Write signals to database
    const createdSignals = await writeSignals(signals);
    console.log(`Created ${createdSignals.length} comp signals for ${date} at venue ${venueId}`);

    // Generate feedback objects from signals
    const feedbackObjects = await generateCompFeedback({
      orgId,
      venueId,
      businessDate: date,
      signalIds: createdSignals.map(s => s.id),
    });

    console.log(`Generated ${feedbackObjects.length} feedback objects for comp signals`);

    return NextResponse.json({
      success: true,
      date,
      venueId,
      signalsCreated: createdSignals.length,
      feedbackObjectsCreated: feedbackObjects.length,
      summary: {
        total_comps: exceptions.summary.total_comps,
        comp_pct: exceptions.summary.comp_pct,
        exceptions_detected: exceptions.exceptions.length,
        unapproved_reasons: exceptions.exceptions.filter(e => e.type === 'unapproved_reason').length,
        high_value: exceptions.exceptions.filter(e => e.type === 'high_value').length,
        high_comp_pct: exceptions.exceptions.filter(e => e.type === 'high_comp_pct').length,
      },
    });
  } catch (error) {
    console.error('Error generating comp signals:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
