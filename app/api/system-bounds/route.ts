/**
 * System Bounds Management API
 * Super admin only - manages global enforcement boundaries (Layer 0)
 *
 * GET /api/system-bounds
 * PUT /api/system-bounds (body: { updates })
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

// Super admin emails (hardcoded for security)
const SUPER_ADMIN_EMAILS = [
  'jacob@hwoodgroup.com',
  'harsh@thebinyangroup.com',
];

/**
 * GET: Retrieve active system bounds
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceClient();

    const { data, error } = await (supabase as any).rpc('get_active_system_bounds');

    if (error) {
      console.error('Error fetching system bounds:', error);
      return NextResponse.json(
        { error: 'Failed to fetch system bounds' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No active system bounds found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data[0],
    });
  } catch (error: any) {
    console.error('Get system bounds error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT: Update system bounds (creates new version)
 * Super admin only
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!updates) {
      return NextResponse.json(
        { error: 'updates are required' },
        { status: 400 }
      );
    }

    // Verify super admin access
    const isSuperAdmin = await verifySuperAdmin(request);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Super admin access required' },
        { status: 403 }
      );
    }

    // Get user ID for audit trail
    const userId = await getUserId(request);

    // Validate updates
    const validationError = validateUpdates(updates);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Get current active bounds
    const { data: currentData } = await (supabase as any).rpc('get_active_system_bounds');
    if (!currentData || currentData.length === 0) {
      return NextResponse.json(
        { error: 'No active system bounds found' },
        { status: 404 }
      );
    }

    const current = currentData[0];
    const nextVersion = current.version + 1;

    // Mark current version as superseded
    await (supabase as any)
      .from('system_bounds')
      .update({
        effective_to: new Date().toISOString(),
        superseded_by_version: nextVersion,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('version', current.version);

    // Build new row
    const newRow: any = {
      version: nextVersion,
      effective_from: new Date().toISOString(),
      effective_to: null,
      is_active: true,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...current, // Start with current values
      ...updates, // Apply updates
    };

    // Remove read-only fields
    delete newRow.superseded_by_version;

    // Insert new version
    const { error: insertError } = await (supabase as any)
      .from('system_bounds')
      .insert(newRow);

    if (insertError) {
      console.error('Error inserting new system bounds version:', insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Fetch updated bounds
    const { data: newData } = await (supabase as any).rpc('get_active_system_bounds');

    return NextResponse.json({
      success: true,
      data: newData[0],
      version: nextVersion,
      message: `System bounds updated to version ${nextVersion}`,
    });
  } catch (error: any) {
    console.error('Update system bounds error:', error);
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
 * Verify user is super admin
 */
async function verifySuperAdmin(request: NextRequest): Promise<boolean> {
  try {
    const supabase = getServiceClient();
    const userId = await getUserId(request);

    if (!userId) {
      return false;
    }

    const { data } = await (supabase as any)
      .from('auth.users')
      .select('email')
      .eq('id', userId)
      .single();

    return data && SUPER_ADMIN_EMAILS.includes(data.email);
  } catch (error) {
    console.error('Error verifying super admin:', error);
    return false;
  }
}

/**
 * Get user ID from request
 */
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
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
 * Validate bounds updates
 */
function validateUpdates(updates: any): string | null {
  // Labor % bounds validation
  if (updates.labor_pct_min !== undefined && updates.labor_pct_max !== undefined) {
    if (updates.labor_pct_min >= updates.labor_pct_max) {
      return 'labor_pct_min must be less than labor_pct_max';
    }
    if (updates.labor_pct_min < 10 || updates.labor_pct_max > 50) {
      return 'Labor % bounds must be reasonable (10-50%)';
    }
  }

  // SPLH bounds validation
  if (updates.splh_min !== undefined && updates.splh_max !== undefined) {
    if (updates.splh_min >= updates.splh_max) {
      return 'splh_min must be less than splh_max';
    }
    if (updates.splh_min < 20 || updates.splh_max > 300) {
      return 'SPLH bounds must be reasonable ($20-300)';
    }
  }

  // CPLH bounds validation
  if (updates.cplh_min !== undefined && updates.cplh_max !== undefined) {
    if (updates.cplh_min >= updates.cplh_max) {
      return 'cplh_min must be less than cplh_max';
    }
    if (updates.cplh_min < 0.5 || updates.cplh_max > 20) {
      return 'CPLH bounds must be reasonable (0.5-20)';
    }
  }

  // Tolerance bounds validation
  if (updates.labor_pct_tolerance_min !== undefined && updates.labor_pct_tolerance_max !== undefined) {
    if (updates.labor_pct_tolerance_min >= updates.labor_pct_tolerance_max) {
      return 'labor_pct_tolerance_min must be less than labor_pct_tolerance_max';
    }
  }

  // Multipliers/ratios validation
  if (updates.splh_critical_multiplier !== undefined) {
    if (updates.splh_critical_multiplier < 0.5 || updates.splh_critical_multiplier > 1) {
      return 'splh_critical_multiplier must be between 0.5 and 1.0';
    }
  }

  // Structural trigger validation
  if (updates.structural_exceptions_7d !== undefined) {
    if (updates.structural_exceptions_7d < 1 || updates.structural_exceptions_7d > 10) {
      return 'structural_exceptions_7d must be between 1 and 10';
    }
  }

  if (updates.structural_exceptions_14d !== undefined) {
    if (updates.structural_exceptions_14d < 1 || updates.structural_exceptions_14d > 20) {
      return 'structural_exceptions_14d must be between 1 and 20';
    }
  }

  return null;
}
