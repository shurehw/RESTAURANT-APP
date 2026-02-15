/**
 * POST /api/enforcement/violations - Create new violation
 * GET /api/enforcement/violations - Query violations
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import {
  createViolation,
  createActionsFromTemplates,
  getActiveViolations,
  getViolationsByDateRange,
  type CreateViolationInput,
  type ViolationSeverity,
  type ViolationType,
} from '@/lib/database/enforcement';

export async function POST(req: NextRequest) {
  try {
    // Allow both user auth and API key (for system-generated violations)
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== process.env.CRON_SECRET) {
      // Require user auth if no valid API key
      const { user, profile } = await requireUser();
    }

    const input: CreateViolationInput = await req.json();

    // Create violation
    const violation = await createViolation(input);

    // Auto-create actions from templates
    const actions = await createActionsFromTemplates(violation);

    return NextResponse.json({
      success: true,
      violation,
      actions_created: actions.length,
    });
  } catch (error: any) {
    console.error('Failed to create violation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create violation' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireUser();
    const { searchParams } = new URL(req.url);

    const mode = searchParams.get('mode') || 'active'; // 'active' or 'range'
    const severity = searchParams.get('severity') as ViolationSeverity | null;

    if (mode === 'active') {
      // Get active violations only
      const violations = await getActiveViolations(
        profile.org_id,
        severity || undefined
      );

      return NextResponse.json({ violations });
    } else {
      // Get violations for date range
      const startDate = searchParams.get('start_date') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0];
      const venueId = searchParams.get('venue_id') || undefined;
      const violationType = searchParams.get('violation_type') as ViolationType | undefined;

      const violations = await getViolationsByDateRange(
        profile.org_id,
        startDate,
        endDate,
        { venueId, violationType, severity: severity || undefined }
      );

      return NextResponse.json({ violations });
    }
  } catch (error: any) {
    console.error('Failed to fetch violations:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch violations' },
      { status: 500 }
    );
  }
}
