import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { calculateCPLH, calculateCPLHTrend } from '@/lib/cplh-calculator';

/**
 * GET /api/labor/cplh/analytics
 * Get CPLH analytics with filters
 *
 * Query params:
 * - venue_id: string (required)
 * - start_date: string (YYYY-MM-DD)
 * - end_date: string (YYYY-MM-DD)
 * - position_id: string (optional)
 * - shift_type: string (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const venue_id = searchParams.get('venue_id');
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');
    const position_id = searchParams.get('position_id');
    const shift_type = searchParams.get('shift_type');

    if (!venue_id) {
      return NextResponse.json(
        { error: 'venue_id is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this venue
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check venue access
    const { data: access } = await supabase
      .from('user_venue_access')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('venue_id', venue_id)
      .single();

    if (!access) {
      return NextResponse.json(
        { error: 'Access denied to this venue' },
        { status: 403 }
      );
    }

    // Build query for CPLH data from materialized view
    let query = supabase
      .from('cplh_by_position_shift')
      .select('*')
      .eq('venue_id', venue_id);

    if (start_date) {
      query = query.gte('business_date', start_date);
    }

    if (end_date) {
      query = query.lte('business_date', end_date);
    }

    if (position_id) {
      query = query.eq('position_id', position_id);
    }

    if (shift_type) {
      query = query.eq('shift_type', shift_type);
    }

    const { data: cplh_data, error: cplh_error } = await query
      .order('business_date', { ascending: false })
      .limit(1000);

    if (cplh_error) throw cplh_error;

    if (!cplh_data || cplh_data.length === 0) {
      return NextResponse.json({
        summary: {
          overall_cplh: 0,
          target_cplh: 0,
          variance_pct: 0,
          trend: 'stable'
        },
        by_position: [],
        by_shift: [],
        timeline: []
      });
    }

    // Get CPLH targets
    const { data: targets } = await supabase
      .from('covers_per_labor_hour_targets')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('is_active', true);

    // Calculate overall CPLH
    const total_covers = cplh_data.reduce((sum, row) => sum + (row.total_covers || 0), 0);
    const total_hours = cplh_data.reduce((sum, row) => sum + (row.total_labor_hours || 0), 0);
    const overall_cplh = total_hours > 0 ? total_covers / total_hours : 0;

    // Find overall target (weighted average)
    const avg_target = targets && targets.length > 0
      ? targets.reduce((sum, t) => sum + t.target_cplh, 0) / targets.length
      : 10.0;

    const overall_calc = calculateCPLH(total_covers, total_hours, avg_target);

    // Calculate trend
    const timeline_data = cplh_data.map(row => ({
      date: row.business_date,
      cplh: row.covers_per_labor_hour || 0
    }));

    const trend_calc = calculateCPLHTrend(timeline_data);

    // Aggregate by position
    const by_position_map = new Map<string, {
      position_name: string;
      position_id: string;
      covers: number;
      hours: number;
      target: number;
    }>();

    cplh_data.forEach(row => {
      const key = row.position_id;
      if (!by_position_map.has(key)) {
        by_position_map.set(key, {
          position_name: row.position_name,
          position_id: row.position_id,
          covers: 0,
          hours: 0,
          target: targets?.find(t => t.position_id === row.position_id)?.target_cplh || 10.0
        });
      }

      const entry = by_position_map.get(key)!;
      entry.covers += row.total_covers || 0;
      entry.hours += row.total_labor_hours || 0;
    });

    const by_position = Array.from(by_position_map.values()).map(entry => {
      const cplh_calc = calculateCPLH(entry.covers, entry.hours, entry.target);
      return {
        position_name: entry.position_name,
        position_id: entry.position_id,
        actual_cplh: cplh_calc.cplh,
        target_cplh: entry.target,
        variance_pct: cplh_calc.variance_pct,
        status: cplh_calc.status,
        recommendation: cplh_calc.message
      };
    });

    // Aggregate by shift type
    const by_shift_map = new Map<string, {
      covers: number;
      hours: number;
      target: number;
    }>();

    cplh_data.forEach(row => {
      const key = row.shift_type;
      if (!by_shift_map.has(key)) {
        by_shift_map.set(key, {
          covers: 0,
          hours: 0,
          target: targets?.find(t => t.shift_type === row.shift_type)?.target_cplh || 10.0
        });
      }

      const entry = by_shift_map.get(key)!;
      entry.covers += row.total_covers || 0;
      entry.hours += row.total_labor_hours || 0;
    });

    const by_shift = Array.from(by_shift_map.entries()).map(([shift_type, entry]) => {
      const actual_cplh = entry.hours > 0 ? entry.covers / entry.hours : 0;
      const variance_pct = entry.target > 0 ? ((actual_cplh - entry.target) / entry.target) * 100 : 0;

      return {
        shift_type,
        actual_cplh: Math.round(actual_cplh * 100) / 100,
        target_cplh: entry.target,
        variance_pct: Math.round(variance_pct * 10) / 10,
        covers: entry.covers,
        labor_hours: entry.hours
      };
    });

    // Timeline (daily aggregates)
    const timeline_map = new Map<string, { covers: number; hours: number }>();
    cplh_data.forEach(row => {
      const key = row.business_date;
      if (!timeline_map.has(key)) {
        timeline_map.set(key, { covers: 0, hours: 0 });
      }
      const entry = timeline_map.get(key)!;
      entry.covers += row.total_covers || 0;
      entry.hours += row.total_labor_hours || 0;
    });

    const timeline = Array.from(timeline_map.entries())
      .map(([date, entry]) => ({
        date,
        cplh: entry.hours > 0 ? Math.round((entry.covers / entry.hours) * 100) / 100 : 0,
        covers: entry.covers,
        labor_hours: entry.hours
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      summary: {
        overall_cplh: overall_calc.cplh,
        target_cplh: avg_target,
        variance_pct: overall_calc.variance_pct,
        trend: trend_calc.trend,
        status: overall_calc.status
      },
      by_position,
      by_shift,
      timeline
    });

  } catch (error) {
    console.error('CPLH analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CPLH analytics' },
      { status: 500 }
    );
  }
}
