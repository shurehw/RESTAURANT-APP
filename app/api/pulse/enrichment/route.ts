/**
 * Pulse Enrichment API — Labor + Comps
 *
 * GET /api/pulse/enrichment?venue_id=xxx&date=YYYY-MM-DD  — single venue
 * GET /api/pulse/enrichment?venue_id=all&date=YYYY-MM-DD  — group-wide
 *
 * Reads pre-computed labor + comp data from sales_snapshots (populated by
 * the /api/sales/poll cron). Instant Supabase reads — no live TipSee queries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getActiveSalesPaceVenues,
  getLatestSnapshot,
} from '@/lib/database/sales-pace';

export interface VenueEnrichment {
  venue_id: string;
  venue_name: string;
  labor: {
    total_hours: number;
    labor_cost: number;
    labor_pct: number;
    splh: number;
    ot_hours: number;
    covers_per_labor_hour: number | null;
    employee_count: number;
    punch_count: number;
    foh: { hours: number; cost: number; employee_count: number } | null;
    boh: { hours: number; cost: number; employee_count: number } | null;
    other: { hours: number; cost: number; employee_count: number } | null;
  } | null;
  comps: {
    total: number;
    pct: number;
    net_sales: number;
    exception_count: number;
    critical_count: number;
    warning_count: number;
    top_exceptions: Array<{
      type: string;
      severity: string;
      server: string;
      comp_total: number;
      message: string;
    }>;
  } | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const userId = user?.id || cookieStore.get('user_id')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const venueId = request.nextUrl.searchParams.get('venue_id');
  const date = request.nextUrl.searchParams.get('date');

  if (!venueId || !date) {
    return NextResponse.json({ error: 'venue_id and date are required' }, { status: 400 });
  }

  if (venueId === 'all') {
    return handleGroupEnrichment(date);
  }

  return handleSingleVenue(venueId, date);
}

function buildEnrichmentFromSnapshot(
  venueId: string,
  venueName: string,
  snapshot: any
): VenueEnrichment {
  if (!snapshot) {
    return { venue_id: venueId, venue_name: venueName, labor: null, comps: null };
  }

  const netSales = Number(snapshot.net_sales) || 0;
  const laborCost = Number(snapshot.labor_cost) || 0;
  const laborHours = Number(snapshot.labor_hours) || 0;
  const covers = Number(snapshot.covers_count) || 0;
  const compsTotal = Number(snapshot.comps_total) || 0;
  const fohCost = Number(snapshot.labor_foh_cost) || 0;
  const bohCost = Number(snapshot.labor_boh_cost) || 0;
  const otherCost = Number(snapshot.labor_other_cost) || Math.max(0, laborCost - fohCost - bohCost);

  // Labor % denominator = net sales + comps (not gross/tax)
  const laborRevBase = netSales + compsTotal;

  // Build labor (only if we have actual labor data)
  const labor = laborHours > 0 || laborCost > 0 ? {
    total_hours: laborHours,
    labor_cost: laborCost,
    labor_pct: laborRevBase > 0 ? (laborCost / laborRevBase) * 100 : 0,
    splh: laborHours > 0 ? laborRevBase / laborHours : 0,
    ot_hours: Number(snapshot.labor_ot_hours) || 0,
    covers_per_labor_hour: laborHours > 0 ? covers / laborHours : null,
    employee_count: Number(snapshot.labor_employee_count) || 0,
    punch_count: 0, // Not stored in snapshot
    foh: fohCost > 0 ? { hours: 0, cost: fohCost, employee_count: 0 } : null,
    boh: bohCost > 0 ? { hours: 0, cost: bohCost, employee_count: 0 } : null,
    other: otherCost > 0 ? { hours: 0, cost: otherCost, employee_count: 0 } : null,
  } : null;

  // Build comps
  const compPct = netSales > 0 ? (compsTotal / netSales) * 100 : 0;
  const topExceptions = Array.isArray(snapshot.comp_top_exceptions)
    ? snapshot.comp_top_exceptions
    : [];

  const comps = {
    total: compsTotal,
    pct: compPct,
    net_sales: netSales,
    exception_count: Number(snapshot.comp_exception_count) || 0,
    critical_count: Number(snapshot.comp_critical_count) || 0,
    warning_count: Number(snapshot.comp_warning_count) || 0,
    top_exceptions: topExceptions,
  };

  return { venue_id: venueId, venue_name: venueName, labor, comps };
}

async function fetchLaborDayFact(
  svc: any,
  venueId: string,
  date: string,
  netSales: number,
  covers: number,
  compsTotal: number = 0
): Promise<VenueEnrichment['labor']> {
  const { data } = await svc
    .from('labor_day_facts')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .maybeSingle();

  if (!data || (Number(data.total_hours) === 0 && Number(data.labor_cost) === 0)) return null;

  const totalHours = Number(data.total_hours) || 0;
  const laborCost = Number(data.labor_cost) || 0;
  const laborRevBase = netSales + compsTotal;
  const buildDept = (h: number, c: number, e: number) =>
    (h > 0 || c > 0) ? { hours: h, cost: c, employee_count: e } : null;

  return {
    total_hours: totalHours,
    labor_cost: laborCost,
    labor_pct: laborRevBase > 0 ? (laborCost / laborRevBase) * 100 : 0,
    splh: totalHours > 0 ? laborRevBase / totalHours : 0,
    ot_hours: Number(data.ot_hours) || 0,
    covers_per_labor_hour: totalHours > 0 ? covers / totalHours : null,
    employee_count: Number(data.employee_count) || 0,
    punch_count: Number(data.punch_count) || 0,
    foh: buildDept(Number(data.foh_hours) || 0, Number(data.foh_cost) || 0, Number(data.foh_employee_count) || 0),
    boh: buildDept(Number(data.boh_hours) || 0, Number(data.boh_cost) || 0, Number(data.boh_employee_count) || 0),
    other: buildDept(Number(data.other_hours) || 0, Number(data.other_cost) || 0, Number(data.other_employee_count) || 0),
  };
}

async function handleSingleVenue(venueId: string, date: string) {
  try {
    const svc = getServiceClient();

    // Fetch venue name + latest snapshot in parallel
    const [venueResult, snapshot] = await Promise.all([
      (svc as any).from('venues').select('name').eq('id', venueId).single(),
      getLatestSnapshot(venueId, date),
    ]);

    const venueName = venueResult.data?.name || venueId;
    const result = buildEnrichmentFromSnapshot(venueId, venueName, snapshot);

    // Fallback: if snapshot has no labor, check labor_day_facts (populated by sales poll)
    if (!result.labor) {
      const netSales = Number(snapshot?.net_sales) || 0;
      const covers = Number(snapshot?.covers_count) || 0;
      const comps = Number(snapshot?.comps_total) || 0;
      result.labor = await fetchLaborDayFact(svc, venueId, date, netSales, covers, comps);
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch enrichment';
    console.error('Pulse enrichment error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleGroupEnrichment(date: string) {
  try {
    const activeVenues = await getActiveSalesPaceVenues();
    if (activeVenues.length === 0) {
      return NextResponse.json({ venues: [], totals: null });
    }

    const svc = getServiceClient();
    const venueIds = activeVenues.map(v => v.venue_id);

    // Fetch venue names + all latest snapshots in parallel
    const [venueResult, ...snapshots] = await Promise.all([
      (svc as any).from('venues').select('id, name').in('id', venueIds),
      ...venueIds.map(vid => getLatestSnapshot(vid, date)),
    ]);

    const nameMap = new Map<string, string>(
      (venueResult.data || []).map((v: { id: string; name: string }) => [v.id, v.name])
    );

    const venues: VenueEnrichment[] = venueIds.map((vid, i) =>
      buildEnrichmentFromSnapshot(vid, nameMap.get(vid) || vid, snapshots[i])
    );

    // Fallback: for venues missing labor in snapshot, check labor_day_facts
    const missingLabor = venues.filter(v => !v.labor);
    if (missingLabor.length > 0) {
      const laborFallbacks = await Promise.all(
        missingLabor.map(v => {
          const snap = snapshots[venueIds.indexOf(v.venue_id)];
          return fetchLaborDayFact(svc, v.venue_id, date, Number(snap?.net_sales) || 0, Number(snap?.covers_count) || 0, Number(snap?.comps_total) || 0);
        })
      );
      missingLabor.forEach((v, i) => {
        if (laborFallbacks[i]) v.labor = laborFallbacks[i];
      });
    }

    // Compute group totals
    let totalLaborCost = 0;
    let totalHours = 0;
    let totalOtHours = 0;
    let totalEmployees = 0;
    let totalCompAmount = 0;
    let totalExceptions = 0;
    let totalCritical = 0;
    let groupNetSales = 0;

    for (const v of venues) {
      if (v.labor) {
        totalLaborCost += v.labor.labor_cost;
        totalHours += v.labor.total_hours;
        totalOtHours += v.labor.ot_hours;
        totalEmployees += v.labor.employee_count;
      }
      if (v.comps) {
        totalCompAmount += v.comps.total;
        totalExceptions += v.comps.exception_count;
        totalCritical += v.comps.critical_count;
        groupNetSales += v.comps.net_sales;
      }
    }

    const totals = {
      labor_cost: totalLaborCost,
      labor_pct: groupNetSales > 0 ? (totalLaborCost / groupNetSales) * 100 : 0,
      total_hours: totalHours,
      ot_hours: totalOtHours,
      employee_count: totalEmployees,
      splh: totalHours > 0 ? groupNetSales / totalHours : 0,
      comp_total: totalCompAmount,
      comp_pct: groupNetSales > 0 ? (totalCompAmount / groupNetSales) * 100 : 0,
      exception_count: totalExceptions,
      critical_count: totalCritical,
      net_sales: groupNetSales,
    };

    return NextResponse.json({ venues, totals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch group enrichment';
    console.error('Group enrichment error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
