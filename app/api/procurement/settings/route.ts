/**
 * Procurement Settings API
 *
 * GET  /api/procurement/settings?org_id=xxx  — fetch active settings
 * PUT  /api/procurement/settings             — update settings (versioned)
 *
 * Auth: Supabase session (user-facing). Only org admins/owners can update.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getActiveProcurementSettings,
  updateProcurementSettings,
  type ProcurementSettings,
} from '@/lib/database/procurement-settings';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = request.nextUrl.searchParams.get('org_id');
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Verify user belongs to this org
    const service = getServiceClient();
    const { data: membership } = await (service as any)
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const settings = await getActiveProcurementSettings(orgId);

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (err: any) {
    console.error('[Procurement Settings API] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { org_id: orgId, updates } = body;

    if (!orgId || !updates) {
      return NextResponse.json(
        { error: 'org_id and updates are required' },
        { status: 400 }
      );
    }

    // Verify user is admin/owner in this org
    const service = getServiceClient();
    const { data: membership } = await (service as any)
      .from('organization_users')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('role', ['admin', 'owner'])
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Validate updates
    const validationError = validateUpdates(updates);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = await updateProcurementSettings(orgId, updates, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update settings' },
        { status: 500 }
      );
    }

    // Fetch updated settings
    const newSettings = await getActiveProcurementSettings(orgId);

    return NextResponse.json({
      success: true,
      data: newSettings,
      version: result.version,
      message: `Settings updated to version ${result.version}`,
    });
  } catch (err: any) {
    console.error('[Procurement Settings API] PUT error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

// ── Validation ──────────────────────────────────────────────────

function validateUpdates(updates: Partial<ProcurementSettings>): string | null {
  if (updates.cost_spike_z_threshold !== undefined) {
    if (updates.cost_spike_z_threshold <= 0 || updates.cost_spike_z_threshold > 10) {
      return 'cost_spike_z_threshold must be between 0 and 10';
    }
  }

  if (updates.cost_spike_lookback_days !== undefined) {
    if (updates.cost_spike_lookback_days < 7 || updates.cost_spike_lookback_days > 365) {
      return 'cost_spike_lookback_days must be between 7 and 365';
    }
  }

  if (updates.cost_spike_min_history !== undefined) {
    if (updates.cost_spike_min_history < 2 || updates.cost_spike_min_history > 50) {
      return 'cost_spike_min_history must be between 2 and 50';
    }
  }

  if (updates.shrink_cost_warning !== undefined) {
    if (updates.shrink_cost_warning <= 0) {
      return 'shrink_cost_warning must be positive';
    }
  }

  if (updates.shrink_cost_critical !== undefined) {
    if (updates.shrink_cost_critical <= 0) {
      return 'shrink_cost_critical must be positive';
    }
  }

  // Ensure critical > warning for shrink
  if (updates.shrink_cost_warning !== undefined && updates.shrink_cost_critical !== undefined) {
    if (updates.shrink_cost_critical <= updates.shrink_cost_warning) {
      return 'shrink_cost_critical must be greater than shrink_cost_warning';
    }
  }

  if (updates.recipe_drift_warning_pct !== undefined) {
    if (updates.recipe_drift_warning_pct <= 0 || updates.recipe_drift_warning_pct > 100) {
      return 'recipe_drift_warning_pct must be between 0 and 100';
    }
  }

  if (updates.recipe_drift_critical_pct !== undefined) {
    if (updates.recipe_drift_critical_pct <= 0 || updates.recipe_drift_critical_pct > 100) {
      return 'recipe_drift_critical_pct must be between 0 and 100';
    }
  }

  // Ensure critical > warning for recipe drift
  if (updates.recipe_drift_warning_pct !== undefined && updates.recipe_drift_critical_pct !== undefined) {
    if (updates.recipe_drift_critical_pct <= updates.recipe_drift_warning_pct) {
      return 'recipe_drift_critical_pct must be greater than recipe_drift_warning_pct';
    }
  }

  if (updates.recipe_drift_lookback_days !== undefined) {
    if (updates.recipe_drift_lookback_days < 7 || updates.recipe_drift_lookback_days > 365) {
      return 'recipe_drift_lookback_days must be between 7 and 365';
    }
  }

  return null;
}
