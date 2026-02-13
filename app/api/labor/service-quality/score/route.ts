import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  calculateServiceQualityScore,
  generateQualityRecommendations,
  type ServiceQualityStandards,
  type StaffingCounts,
  type EmployeePerformance
} from '@/lib/service-quality-calculator';

/**
 * GET /api/labor/service-quality/score
 * Calculate service quality score for a specific date/shift
 *
 * Query params:
 * - venue_id: string (required)
 * - date: string (YYYY-MM-DD, required)
 * - shift_type: string (optional - if not provided, returns overall day score)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const venue_id = searchParams.get('venue_id');
    const date = searchParams.get('date');
    const shift_type = searchParams.get('shift_type');

    if (!venue_id || !date) {
      return NextResponse.json(
        { error: 'venue_id and date are required' },
        { status: 400 }
      );
    }

    // Verify user access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: access } = await (supabase as any)
      .from('user_venue_access')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('venue_id', venue_id)
      .single();

    if (!access) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get service quality standards for this venue
    const { data: standards_data, error: standards_error } = await supabase
      .from('service_quality_standards')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .or(`shift_type.is.null,shift_type.eq.${shift_type || 'null'}`)
      .order('shift_type', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    if (standards_error && standards_error.code !== 'PGRST116') {
      throw standards_error;
    }

    // Default standards if none found
    const standards: ServiceQualityStandards = (standards_data as ServiceQualityStandards) || {
      max_tables_per_server: 3.5,
      max_covers_per_server: 12.0,
      min_busser_to_server_ratio: 0.5,
      min_runner_to_server_ratio: 0.33,
      min_sommelier_covers_threshold: 40,
      quality_priority_weight: 0.7,
      min_service_quality_score: 0.85
    };

    // Get shift assignments for this date
    let assignments_query = supabase
      .from('shift_assignments')
      .select(`
        *,
        position:positions(name, category),
        employee:employees(performance_rating, covers_per_hour_avg)
      `)
      .eq('venue_id', venue_id)
      .eq('business_date', date)
      .in('status', ['scheduled', 'confirmed', 'completed']);

    if (shift_type) {
      assignments_query = assignments_query.eq('shift_type', shift_type);
    }

    const { data: assignments, error: assignments_error } = await assignments_query;

    if (assignments_error) throw assignments_error;

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        overall_score: 0,
        components: {
          server_coverage: 0,
          support_ratio: 0,
          experience: 0,
          efficiency: 0
        },
        violations: [{
          constraint: 'no_staff_scheduled',
          severity: 'critical' as const,
          description: 'No staff scheduled for this date/shift',
          impact: 'Cannot operate without staff'
        }],
        meets_minimum: false,
        recommendations: ['Schedule staff for this shift']
      });
    }

    // Count staff by position
    const servers = assignments.filter(a => a.position?.name === 'Server').length;
    const bussers = assignments.filter(a => a.position?.name === 'Busser').length;
    const runners = assignments.filter(a => a.position?.name === 'Food Runner').length;
    const sommeliers = assignments.filter(a => a.position?.name === 'Sommelier').length;

    // Get covers for this date/shift
    let covers_query = supabase
      .from('demand_history')
      .select('covers')
      .eq('venue_id', venue_id)
      .eq('business_date', date);

    if (shift_type) {
      covers_query = covers_query.eq('shift_type', shift_type);
    }

    const { data: covers_data } = await covers_query;
    const total_covers = covers_data?.reduce((sum, row) => sum + (row.covers || 0), 0) || 0;

    // Total labor hours
    const total_hours = assignments.reduce((sum, a) => sum + (a.scheduled_hours || 0), 0);

    const staffing: StaffingCounts = {
      servers,
      bussers,
      runners,
      sommeliers,
      total_covers,
      total_hours
    };

    // Employee performance
    const employeePerformance: EmployeePerformance[] = assignments
      .filter(a => a.employee?.performance_rating)
      .map(a => ({
        employee_id: a.employee_id,
        performance_rating: a.employee.performance_rating ?? 0,
        covers_per_hour_avg: a.employee.covers_per_hour_avg ?? 0,
      }));

    // Calculate score
    const score = calculateServiceQualityScore(staffing, standards, employeePerformance);

    // Generate recommendations
    const recommendations = generateQualityRecommendations(score, staffing, standards);

    return NextResponse.json({
      ...score,
      recommendations,
      staffing_details: staffing,
      standards_applied: {
        max_covers_per_server: standards.max_covers_per_server,
        min_busser_ratio: standards.min_busser_to_server_ratio,
        min_runner_ratio: standards.min_runner_to_server_ratio,
        min_quality_score: standards.min_service_quality_score
      }
    });

  } catch (error) {
    console.error('Service quality score error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate service quality score' },
      { status: 500 }
    );
  }
}
