/**
 * Labor Requirements Calculator API
 * Triggers Python calculator to compute staffing needs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const calculateSchema = z.object({
  venue_id: uuid,
  forecast_id: uuid.optional(),
  days_ahead: z.number().int().min(1).max(30).optional(),
});

const requirementsQuerySchema = z.object({
  venue_id: uuid,
  forecast_id: uuid.optional(),
  business_date: z.string().date().optional(),
});

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':labor-requirements-calc');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(calculateSchema, body);
    assertVenueAccess(validated.venue_id, venueIds);

    // Path to Python script
    const scriptPath = path.join(
      process.cwd(),
      'python-services',
      'labor_analyzer',
      'requirements_calculator.py'
    );

    // Build command
    let command = `python "${scriptPath}" --venue-id ${validated.venue_id}`;

    if (validated.forecast_id) {
      command += ` --forecast-id ${validated.forecast_id}`;
    } else if (validated.days_ahead) {
      command += ` --days-ahead ${validated.days_ahead}`;
    }

    const { stdout, stderr } = await execAsync(command, {
      env: {
        ...process.env,
        PYTHONPATH: path.join(process.cwd(), 'python-services'),
      },
      timeout: 60000, // 60 second timeout
    });

    if (stderr && !stderr.includes('warning')) console.error('Python stderr:', stderr);

    const supabase = await createClient();
    let requirementsQuery = supabase
      .from('labor_requirements')
      .select(`
        *,
        position:positions(name, category, base_hourly_rate)
      `)
      .eq('venue_id', validated.venue_id);

    if (validated.forecast_id) {
      requirementsQuery = requirementsQuery.eq('forecast_id', validated.forecast_id);
    }

    const { data: requirements, error } = await requirementsQuery
      .order('business_date', { ascending: true })
      .order('position', { ascending: true });

    if (error) throw error;

    // Calculate summary
    const totalCost = requirements?.reduce(
      (sum, req) => sum + (req.total_cost || 0),
      0
    );
    const totalHours = requirements?.reduce(
      (sum, req) => sum + (req.total_hours || 0),
      0
    );
    const avgLaborPercentage =
      requirements && requirements.length > 0
        ? requirements[0].labor_percentage
        : 0;

    return NextResponse.json({
      success: true,
      requirements,
      summary: {
        totalCost: totalCost || 0,
        totalHours: totalHours || 0,
        avgLaborPercentage: avgLaborPercentage || 0,
        count: requirements?.length || 0,
      },
      stdout,
    });
  });
}

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':labor-requirements-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(requirementsQuerySchema, searchParams);
    assertVenueAccess(params.venue_id, venueIds);

    const supabase = await createClient();

    let query = supabase
      .from('labor_requirements')
      .select(`
        *,
        position:positions(name, category, base_hourly_rate),
        forecast:demand_forecasts(business_date, shift_type, covers_predicted, revenue_predicted)
      `)
      .eq('venue_id', params.venue_id);

    if (params.forecast_id) {
      query = query.eq('forecast_id', params.forecast_id);
    } else if (params.business_date) {
      query = query.eq('business_date', params.business_date);
    }

    const { data: requirements, error } = await query
      .order('business_date', { ascending: true })
      .order('position', { ascending: true });

    if (error) throw error;

    // Group by date/shift
    const grouped = requirements?.reduce((acc: any, req: any) => {
      const key = `${req.business_date}_${req.shift_type}`;
      if (!acc[key]) {
        acc[key] = {
          business_date: req.business_date,
          shift_type: req.shift_type,
          forecast: req.forecast,
          positions: [],
          total_cost: 0,
          total_hours: 0,
          labor_percentage: req.labor_percentage,
          within_target: req.within_target,
        };
      }
      acc[key].positions.push({
        position: req.position.name,
        employees_needed: req.employees_needed,
        hours_per_employee: req.hours_per_employee,
        total_hours: req.total_hours,
        total_cost: req.total_cost,
      });
      acc[key].total_cost += req.total_cost || 0;
      acc[key].total_hours += req.total_hours || 0;
      return acc;
    }, {});

    return NextResponse.json({
      requirements: Object.values(grouped || {}),
    });
  });
}
