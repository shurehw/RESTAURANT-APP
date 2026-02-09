/**
 * Attestation Dashboard API
 * Provides compliance overview for Control Plane
 *
 * GET /api/attestations/dashboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&venue_id=xxx
 *
 * Returns:
 * - Submission status grid (venue x date)
 * - Compliance metrics (% submitted, pending, late)
 * - Outstanding queue (actionable items)
 * - Violation rollups (revenue/labor reasons, comp codes, incidents)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

// SLA: Attestation due by 2pm local time next day (hardcoded UTC-8 for now)
const ATTESTATION_DUE_HOUR = 14; // 2pm
const TIMEZONE_OFFSET_HOURS = -8; // PST/PDT (TODO: fetch from venue.timezone)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Date range (default: last 7 days)
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0];
  const startDate = searchParams.get('start_date') || (() => {
    const d = new Date(endDate);
    d.setDate(d.getDate() - 6); // 7 days including end_date
    return d.toISOString().split('T')[0];
  })();

  const venueIdFilter = searchParams.get('venue_id'); // optional, null = all venues

  const supabase = getServiceClient();

  try {
    // ══════════════════════════════════════════════════════════════════════
    // 1. FETCH VENUES (scoped to user's organization)
    // ══════════════════════════════════════════════════════════════════════

    let venuesQuery = (supabase as any)
      .from('venues')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (venueIdFilter) {
      venuesQuery = venuesQuery.eq('id', venueIdFilter);
    }

    const { data: venues, error: venuesError } = await venuesQuery;
    if (venuesError) throw venuesError;

    if (!venues || venues.length === 0) {
      return NextResponse.json({
        range: { start: startDate, end: endDate },
        venues: [],
        compliance: { submitted: 0, expected: 0, pct: 0, pending: 0, late: 0 },
        grid: [],
        outstanding: [],
        rollups: null,
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. GENERATE EXPECTED GRID (venue x date matrix)
    // ══════════════════════════════════════════════════════════════════════

    // Generate date series
    const { data: dateSeries } = await (supabase as any).rpc('generate_date_series', {
      start_date: startDate,
      end_date: endDate,
    });

    // Cartesian product: venues x dates
    const expectedGrid: Array<{
      venue_id: string;
      venue_name: string;
      business_date: string;
    }> = [];

    for (const venue of venues) {
      for (const dateRow of dateSeries || []) {
        expectedGrid.push({
          venue_id: venue.id,
          venue_name: venue.name,
          business_date: dateRow.date,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. FETCH ATTESTATIONS (for date range + venues)
    // ══════════════════════════════════════════════════════════════════════

    const { data: attestations, error: attestationsError } = await (supabase as any)
      .from('nightly_attestations')
      .select(`
        id,
        venue_id,
        business_date,
        status,
        submitted_at,
        submitted_by,
        has_violations,
        violation_count,
        critical_incident_count,
        comp_violation_count,
        requires_escalation,
        revenue_variance_reason,
        labor_variance_reason
      `)
      .in('venue_id', venues.map((v: any) => v.id))
      .gte('business_date', startDate)
      .lte('business_date', endDate);

    if (attestationsError) throw attestationsError;

    // Build lookup map: venue_id + business_date → attestation
    const attestationMap = new Map<string, any>();
    for (const att of attestations || []) {
      const key = `${att.venue_id}:${att.business_date}`;
      attestationMap.set(key, att);
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. COMPUTE GRID STATES (submitted / pending / late)
    // ══════════════════════════════════════════════════════════════════════

    const now = new Date();
    const gridWithState: Array<{
      venue_id: string;
      venue_name: string;
      business_date: string;
      state: 'submitted' | 'pending' | 'late' | 'not_applicable';
      attestation_id?: string;
      has_violations?: boolean;
      violation_count?: number;
      submitted_at?: string;
    }> = [];

    let submittedCount = 0;
    let lateCount = 0;
    let pendingCount = 0;

    for (const cell of expectedGrid) {
      const key = `${cell.venue_id}:${cell.business_date}`;
      const attestation = attestationMap.get(key);

      let state: 'submitted' | 'pending' | 'late' | 'not_applicable' = 'not_applicable';

      if (attestation) {
        if (attestation.status === 'submitted' || attestation.status === 'amended') {
          state = 'submitted';
          submittedCount++;
        } else {
          // Draft: check if late or pending
          const dueAt = computeDueDate(cell.business_date);
          if (now > dueAt) {
            state = 'late';
            lateCount++;
          } else {
            state = 'pending';
            pendingCount++;
          }
        }
      } else {
        // No attestation record exists yet
        const dueAt = computeDueDate(cell.business_date);
        if (now > dueAt) {
          state = 'late';
          lateCount++;
        } else {
          // Future date or within window
          const businessDate = new Date(cell.business_date + 'T00:00:00');
          if (businessDate > now) {
            state = 'not_applicable';
          } else {
            state = 'pending';
            pendingCount++;
          }
        }
      }

      gridWithState.push({
        venue_id: cell.venue_id,
        venue_name: cell.venue_name,
        business_date: cell.business_date,
        state,
        attestation_id: attestation?.id,
        has_violations: attestation?.has_violations,
        violation_count: attestation?.violation_count,
        submitted_at: attestation?.submitted_at,
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. BUILD GRID STRUCTURE (grouped by venue)
    // ══════════════════════════════════════════════════════════════════════

    const gridByVenue = new Map<string, any[]>();
    for (const cell of gridWithState) {
      if (!gridByVenue.has(cell.venue_id)) {
        gridByVenue.set(cell.venue_id, []);
      }
      gridByVenue.get(cell.venue_id)!.push({
        date: cell.business_date,
        state: cell.state,
        attestation_id: cell.attestation_id,
        has_violations: cell.has_violations,
        violation_count: cell.violation_count,
      });
    }

    const grid = Array.from(gridByVenue.entries()).map(([venueId, days]) => ({
      venue_id: venueId,
      venue_name: venues.find((v: any) => v.id === venueId)?.name || 'Unknown',
      days,
    }));

    // ══════════════════════════════════════════════════════════════════════
    // 6. OUTSTANDING QUEUE (pending + late, sorted by severity)
    // ══════════════════════════════════════════════════════════════════════

    const outstanding = gridWithState
      .filter(cell => cell.state === 'late' || cell.state === 'pending')
      .map(cell => ({
        venue_id: cell.venue_id,
        venue_name: cell.venue_name,
        business_date: cell.business_date,
        state: cell.state,
        due_at: computeDueDate(cell.business_date).toISOString(),
        attestation_id: cell.attestation_id,
      }))
      .sort((a, b) => {
        // Late first, then by date (oldest first)
        if (a.state === 'late' && b.state !== 'late') return -1;
        if (a.state !== 'late' && b.state === 'late') return 1;
        return a.business_date.localeCompare(b.business_date);
      });

    // ══════════════════════════════════════════════════════════════════════
    // 7. ROLLUPS (variance reasons, comp codes, incidents)
    // ══════════════════════════════════════════════════════════════════════

    // Revenue variance reasons
    const revenueReasons = (attestations || [])
      .filter((a: any) => a.revenue_variance_reason)
      .reduce((acc: any, att: any) => {
        const reason = att.revenue_variance_reason;
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});

    const revenueReasonsArray = Object.entries(revenueReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a: any, b: any) => b.count - a.count);

    // Labor variance reasons
    const laborReasons = (attestations || [])
      .filter((a: any) => a.labor_variance_reason)
      .reduce((acc: any, att: any) => {
        const reason = att.labor_variance_reason;
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});

    const laborReasonsArray = Object.entries(laborReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a: any, b: any) => b.count - a.count);

    // Comp resolution codes
    const { data: compResolutions } = await (supabase as any)
      .from('comp_resolutions')
      .select('resolution_code, is_policy_violation, requires_follow_up')
      .in('attestation_id', (attestations || []).map((a: any) => a.id));

    const compCodes = (compResolutions || []).reduce((acc: any, res: any) => {
      const code = res.resolution_code;
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});

    const compCodesArray = Object.entries(compCodes)
      .map(([code, count]) => ({ code, count }))
      .sort((a: any, b: any) => b.count - a.count);

    const policyViolationsCount = (compResolutions || []).filter(
      (r: any) => r.is_policy_violation || r.requires_follow_up
    ).length;

    // Incidents
    const { data: incidents } = await (supabase as any)
      .from('nightly_incidents')
      .select('incident_type, severity, resolved, requires_escalation')
      .in('attestation_id', (attestations || []).map((a: any) => a.id));

    const incidentsByType = (incidents || []).reduce((acc: any, inc: any) => {
      const type = inc.incident_type;
      if (!acc[type]) {
        acc[type] = { total: 0, open: 0, high_severity: 0 };
      }
      acc[type].total++;
      if (!inc.resolved) acc[type].open++;
      if (inc.severity === 'high' || inc.severity === 'critical') acc[type].high_severity++;
      return acc;
    }, {});

    const incidentsArray = Object.entries(incidentsByType).map(([type, stats]: any) => ({
      type,
      total: stats.total,
      open: stats.open,
      high_severity: stats.high_severity,
    }));

    // ══════════════════════════════════════════════════════════════════════
    // 8. COMPLIANCE SUMMARY
    // ══════════════════════════════════════════════════════════════════════

    const expectedCount = expectedGrid.filter(cell => {
      const businessDate = new Date(cell.business_date + 'T00:00:00');
      return businessDate <= now; // Only count past/current days
    }).length;

    const compliancePct = expectedCount > 0 ? submittedCount / expectedCount : 0;

    // ══════════════════════════════════════════════════════════════════════
    // 9. RETURN PAYLOAD
    // ══════════════════════════════════════════════════════════════════════

    return NextResponse.json({
      range: { start: startDate, end: endDate },
      venues: venues.map((v: any) => ({ venue_id: v.id, name: v.name })),
      compliance: {
        submitted: submittedCount,
        expected: expectedCount,
        pct: Math.round(compliancePct * 1000) / 10, // e.g., 88.9
        pending: pendingCount,
        late: lateCount,
      },
      grid,
      outstanding,
      rollups: {
        revenue_reasons: revenueReasonsArray.slice(0, 10),
        labor_reasons: laborReasonsArray.slice(0, 10),
        comp_codes: compCodesArray.slice(0, 10),
        policy_violations: { count: policyViolationsCount },
        incidents: incidentsArray,
      },
    });

  } catch (error: any) {
    console.error('Attestation dashboard API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attestation dashboard data' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Compute due date for attestation (business_date + 1 day at 2pm local time)
 */
function computeDueDate(businessDate: string): Date {
  const d = new Date(businessDate + 'T00:00:00');
  d.setDate(d.getDate() + 1); // Next day
  d.setHours(ATTESTATION_DUE_HOUR - TIMEZONE_OFFSET_HOURS, 0, 0, 0); // 2pm local → UTC
  return d;
}
