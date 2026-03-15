/**
 * Menu Agent Settings
 *
 * GET  /api/menu-agent/settings — Get current settings for org
 * POST /api/menu-agent/settings — Update settings (creates new P0 version)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import {
  getMenuAgentSettings,
  updateMenuAgentSettings,
} from '@/lib/database/menu-agent';
import { getDefaultMenuAgentPolicy } from '@/lib/ai/menu-agent-policy';

export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getMenuAgentSettings(ctx.orgId);
  const defaults = getDefaultMenuAgentPolicy();

  return NextResponse.json({
    settings: settings || null,
    defaults,
    has_custom_settings: !!settings,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Validate allowed fields
  const allowedFields = [
    'mode',
    'enabled_signals',
    'auto_price_band_pct',
    'auto_price_band_dollars',
    'max_menu_size',
    'min_contribution_margin_dollars',
    'min_item_velocity_per_week',
    'underperformer_observation_days',
    'cannibalization_correlation_threshold',
    'sacred_recipe_ids',
    'comp_set_scan_enabled',
    'comp_set_scan_frequency_days',
    'seasonality_window_days',
    'elasticity_observation_days',
    'min_price_changes_for_elasticity',
    'max_single_price_increase_pct',
    'require_comp_set_validation',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  }

  const result = await updateMenuAgentSettings(ctx.orgId, updates, ctx.authUserId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    version: result.version,
  });
}
