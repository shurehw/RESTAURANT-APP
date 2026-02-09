/**
 * Operational Standards Management API
 * Allows organization admins to view and update unified enforcement standards
 * (comp + labor + revenue)
 *
 * GET /api/operational-standards?org_id=xxx
 * PUT /api/operational-standards (body: { org_id, updates })
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveOperationalStandards,
  updateOperationalStandards,
} from '@/lib/database/operational-standards';
import { validateLaborStandards } from '@/lib/database/labor-exceptions';
import { getLaborBounds } from '@/lib/database/system-bounds';
import { getServiceClient } from '@/lib/supabase/service';

/**
 * GET: Retrieve active operational standards for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this org
    const hasAccess = await verifyOrgAccess(request, orgId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const standards = await getActiveOperationalStandards(orgId);

    if (!standards) {
      return NextResponse.json(
        { error: 'No operational standards found for this organization' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: standards,
    });
  } catch (error: any) {
    console.error('Get operational standards error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update operational standards (creates new version)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id: orgId, updates } = body;

    if (!orgId || !updates) {
      return NextResponse.json(
        { error: 'org_id and updates are required' },
        { status: 400 }
      );
    }

    // Verify user has admin access to this org
    const isAdmin = await verifyOrgAdmin(request, orgId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get user ID for audit trail
    const userId = await getUserId(request);

    // Fetch system bounds for validation
    const laborBounds = await getLaborBounds();

    // Validate updates
    const validationError = validateUpdates(updates, laborBounds);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const result = await updateOperationalStandards(orgId, updates, userId || undefined);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update standards' },
        { status: 500 }
      );
    }

    // Fetch updated standards
    const newStandards = await getActiveOperationalStandards(orgId);

    return NextResponse.json({
      success: true,
      data: newStandards,
      version: result.version,
      message: `Standards updated to version ${result.version}`,
    });
  } catch (error: any) {
    console.error('Update operational standards error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Verify user has access to organization
 */
async function verifyOrgAccess(request: NextRequest, orgId: string): Promise<boolean> {
  try {
    const supabase = getServiceClient();
    const userId = await getUserId(request);

    if (!userId) {
      return false;
    }

    const { data } = await (supabase as any)
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Error verifying org access:', error);
    return false;
  }
}

/**
 * Verify user has admin access to organization
 */
async function verifyOrgAdmin(request: NextRequest, orgId: string): Promise<boolean> {
  try {
    const supabase = getServiceClient();
    const userId = await getUserId(request);

    if (!userId) {
      return false;
    }

    const { data } = await (supabase as any)
      .from('organization_users')
      .select('organization_id, role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('role', ['admin', 'owner'])
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Error verifying org admin:', error);
    return false;
  }
}

/**
 * Get user ID from request
 */
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    // Try to get from authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getServiceClient();
    const { data, error } = await (supabase as any).auth.getUser(token);

    if (error || !data?.user) {
      return null;
    }

    return data.user.id;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
}

/**
 * Validate settings updates
 */
function validateUpdates(updates: any, LABOR_BOUNDS: any): string | null {
  // ── Comp Settings Validation ──

  if (updates.high_value_comp_threshold !== undefined) {
    if (updates.high_value_comp_threshold <= 0) {
      return 'high_value_comp_threshold must be positive';
    }
  }

  if (updates.high_comp_pct_threshold !== undefined) {
    if (updates.high_comp_pct_threshold <= 0 || updates.high_comp_pct_threshold > 100) {
      return 'high_comp_pct_threshold must be between 0 and 100';
    }
  }

  if (updates.daily_comp_pct_warning !== undefined) {
    if (updates.daily_comp_pct_warning <= 0 || updates.daily_comp_pct_warning > 100) {
      return 'daily_comp_pct_warning must be between 0 and 100';
    }
  }

  if (updates.daily_comp_pct_critical !== undefined) {
    if (updates.daily_comp_pct_critical <= 0 || updates.daily_comp_pct_critical > 100) {
      return 'daily_comp_pct_critical must be between 0 and 100';
    }
  }

  if (updates.server_max_comp_amount !== undefined) {
    if (updates.server_max_comp_amount <= 0) {
      return 'server_max_comp_amount must be positive';
    }
  }

  if (updates.manager_min_for_high_value !== undefined) {
    if (updates.manager_min_for_high_value <= 0) {
      return 'manager_min_for_high_value must be positive';
    }
  }

  if (updates.ai_max_tokens !== undefined) {
    if (updates.ai_max_tokens < 1000 || updates.ai_max_tokens > 8000) {
      return 'ai_max_tokens must be between 1000 and 8000';
    }
  }

  if (updates.ai_temperature !== undefined) {
    if (updates.ai_temperature < 0 || updates.ai_temperature > 1) {
      return 'ai_temperature must be between 0 and 1';
    }
  }

  if (updates.approved_reasons !== undefined) {
    if (!Array.isArray(updates.approved_reasons)) {
      return 'approved_reasons must be an array';
    }

    for (const reason of updates.approved_reasons) {
      if (!reason.name || typeof reason.name !== 'string') {
        return 'Each approved reason must have a name';
      }
      if (typeof reason.requires_manager_approval !== 'boolean') {
        return 'Each approved reason must specify requires_manager_approval';
      }
      if (reason.max_amount !== null && (typeof reason.max_amount !== 'number' || reason.max_amount <= 0)) {
        return 'max_amount must be null or a positive number';
      }
    }
  }

  if (updates.manager_roles !== undefined) {
    if (!Array.isArray(updates.manager_roles) || updates.manager_roles.length === 0) {
      return 'manager_roles must be a non-empty array';
    }
  }

  // ── Labor Settings Validation (Layer 1 bounds enforcement) ──

  if (updates.target_labor_pct !== undefined) {
    if (updates.target_labor_pct < LABOR_BOUNDS.LABOR_PCT_MIN || updates.target_labor_pct > LABOR_BOUNDS.LABOR_PCT_MAX) {
      return `target_labor_pct must be between ${LABOR_BOUNDS.LABOR_PCT_MIN}% and ${LABOR_BOUNDS.LABOR_PCT_MAX}% (OpsOS Layer 1 bounds)`;
    }
  }

  if (updates.labor_pct_tolerance !== undefined) {
    if (updates.labor_pct_tolerance < LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MIN || updates.labor_pct_tolerance > LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MAX) {
      return `labor_pct_tolerance must be between ${LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MIN}% and ${LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MAX}% (OpsOS Layer 1 bounds)`;
    }
  }

  if (updates.splh_floor !== undefined) {
    if (updates.splh_floor < LABOR_BOUNDS.SPLH_MIN || updates.splh_floor > LABOR_BOUNDS.SPLH_MAX) {
      return `splh_floor must be between $${LABOR_BOUNDS.SPLH_MIN} and $${LABOR_BOUNDS.SPLH_MAX} (OpsOS Layer 1 bounds)`;
    }
  }

  if (updates.cplh_target !== undefined) {
    if (updates.cplh_target < LABOR_BOUNDS.CPLH_MIN || updates.cplh_target > LABOR_BOUNDS.CPLH_MAX) {
      return `cplh_target must be between ${LABOR_BOUNDS.CPLH_MIN} and ${LABOR_BOUNDS.CPLH_MAX} (OpsOS Layer 1 bounds)`;
    }
  }

  if (updates.cplh_tolerance !== undefined) {
    if (updates.cplh_tolerance <= 0 || updates.cplh_tolerance > 2) {
      return 'cplh_tolerance must be between 0 and 2';
    }
  }

  if (updates.ot_warning_threshold !== undefined && updates.ot_critical_threshold !== undefined) {
    if (updates.ot_warning_threshold >= updates.ot_critical_threshold) {
      return 'ot_warning_threshold must be less than ot_critical_threshold';
    }
  }

  if (updates.excluded_roles !== undefined) {
    if (!Array.isArray(updates.excluded_roles)) {
      return 'excluded_roles must be an array';
    }
  }

  return null;
}
