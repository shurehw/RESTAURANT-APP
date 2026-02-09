/**
 * Labor Exceptions API
 *
 * Detects labor efficiency violations using integrated diagnostic logic.
 *
 * ENFORCEMENT PRINCIPLE:
 * Metrics are NEVER evaluated in isolation.
 * SPLH + CPLH diagnostic matrix determines root cause.
 * Labor % adds severity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getOperationalStandardsForVenue } from '@/lib/database/operational-standards';
import { detectLaborExceptions, type LaborMetrics } from '@/lib/database/labor-exceptions';
import { getLaborBounds } from '@/lib/database/system-bounds';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const venueId = searchParams.get('venue_id');

    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'date and venue_id are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Fetch org-specific operational standards
    const standards = await getOperationalStandardsForVenue(venueId);

    if (!standards) {
      return NextResponse.json(
        { error: 'No operational standards found for this venue' },
        { status: 404 }
      );
    }

    // Fetch labor metrics from labor_day_facts
    const { data: laborData, error: laborError } = await (supabase as any)
      .from('labor_day_facts')
      .select('total_hours, labor_cost, ot_hours')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .single();

    if (laborError && laborError.code !== 'PGRST116') {
      console.error('Error fetching labor data:', laborError);
      return NextResponse.json(
        { error: 'Failed to fetch labor data' },
        { status: 500 }
      );
    }

    // Fetch sales/covers from venue_day_facts
    const { data: venueData, error: venueError } = await (supabase as any)
      .from('venue_day_facts')
      .select('net_sales, covers_count')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .single();

    if (venueError && venueError.code !== 'PGRST116') {
      console.error('Error fetching venue data:', venueError);
      return NextResponse.json(
        { error: 'Failed to fetch venue data' },
        { status: 500 }
      );
    }

    // No data for this date
    if (!laborData || !venueData) {
      return NextResponse.json({
        success: true,
        data: {
          date,
          venue_id: venueId,
          has_data: false,
          message: 'No labor data available for this date',
        },
      });
    }

    // Build labor metrics
    const metrics: LaborMetrics = {
      net_sales: venueData.net_sales || 0,
      labor_cost: laborData.labor_cost || 0,
      labor_hours: laborData.total_hours || 0,
      covers: venueData.covers_count || 0,
      ot_hours: laborData.ot_hours || 0,
    };

    // Fetch recent exceptions for structural trigger check (last 14 days)
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 14);

    const { data: recentExceptionsData } = await (supabase as any)
      .from('labor_exceptions')
      .select('business_date, severity')
      .eq('venue_id', venueId)
      .gte('business_date', startDate.toISOString().split('T')[0])
      .lt('business_date', date);

    const recentExceptions = (recentExceptionsData || []).map((e: any) => ({
      date: e.business_date,
      critical: e.severity === 'critical' || e.severity === 'structural',
    }));

    // Fetch system bounds (Layer 0)
    const laborBounds = await getLaborBounds();

    // Run exception detection
    const result = detectLaborExceptions(
      metrics,
      standards.labor,
      date,
      laborBounds,
      recentExceptions
    );

    // Save exceptions to database (for historical tracking + structural triggers)
    if (result.exceptions.length > 0) {
      const exceptionRows = result.exceptions.map((ex) => ({
        venue_id: venueId,
        business_date: date,
        exception_type: ex.type,
        severity: ex.severity,
        diagnostic: result.diagnostic,
        message: ex.message,
        actual_value: ex.actual_value,
        expected_value: ex.expected_value,
        variance_pct: ex.variance_pct,
        created_at: new Date().toISOString(),
      }));

      const { error: insertError } = await (supabase as any)
        .from('labor_exceptions')
        .upsert(exceptionRows, {
          onConflict: 'venue_id,business_date,exception_type',
        });

      if (insertError) {
        console.error('Error saving labor exceptions:', insertError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        venue_id: venueId,
        has_data: true,
        standards_version: standards.version,
      },
    });
  } catch (error: any) {
    console.error('Labor exceptions API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
