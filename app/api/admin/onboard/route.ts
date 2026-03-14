/**
 * POST /api/admin/onboard
 *
 * Creates a complete venue onboarding: org, venue, POS config, location config,
 * sales pace settings, comp settings, and operational standards.
 *
 * Auth: Platform admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/requirePlatformAdmin';
import { createAdminClient } from '@/lib/supabase/server';
import { encryptApiKey } from '@/lib/integrations/toast';

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 401 }
    );
  }

  const adminClient = createAdminClient();

  try {
    const body = await request.json();

    // ── 1. Organization ──────────────────────────────────────────────────
    let orgId: string;

    if (body.orgMode === 'new') {
      if (!body.orgName || !body.orgSlug) {
        return NextResponse.json({ error: 'Organization name and slug are required' }, { status: 400 });
      }

      const { data: org, error: orgError } = await adminClient
        .from('organizations')
        .insert({
          name: body.orgName,
          slug: body.orgSlug,
          plan: body.orgPlan || 'professional',
          subscription_status: 'active',
          timezone: body.orgTimezone || 'America/Los_Angeles',
          is_active: true,
          onboarding_completed: false,
        })
        .select()
        .single();

      if (orgError) {
        return NextResponse.json({ error: `Failed to create organization: ${orgError.message}` }, { status: 500 });
      }

      orgId = org.id;

      // Organization settings
      await adminClient
        .from('organization_settings')
        .insert({ organization_id: orgId })
        .single();

      // Organization usage
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      await adminClient
        .from('organization_usage')
        .insert({ organization_id: orgId, period_start: periodStart, period_end: periodEnd });

    } else {
      if (!body.orgId) {
        return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
      }
      orgId = body.orgId;
    }

    // ── 2. Venue ─────────────────────────────────────────────────────────
    if (!body.venueName) {
      return NextResponse.json({ error: 'Venue name is required' }, { status: 400 });
    }

    // The venues table pos_type enum only has 'toast' and 'square'.
    // For upserve/simphony/manual, store as 'toast' (legacy field) — real POS type
    // is determined at runtime from TipSee general_locations or toast_venue_config.
    const dbPosType = body.posType === 'toast' ? 'toast' : 'toast';

    const { data: venue, error: venueError } = await (adminClient as any)
      .from('venues')
      .insert({
        name: body.venueName,
        organization_id: orgId,
        pos_type: dbPosType,
        is_active: true,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip_code: body.zipCode || null,
        phone: body.phone || null,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        timezone: body.timezone || 'America/Los_Angeles',
        venue_class: body.venueClass || null,
      })
      .select()
      .single();

    if (venueError) {
      return NextResponse.json({ error: `Failed to create venue: ${venueError.message}` }, { status: 500 });
    }

    const venueId = venue.id;

    // ── 3. POS-specific mapping ──────────────────────────────────────────
    if (body.posType === 'toast' && body.toastGuid && body.toastClientId && body.toastClientSecret) {
      await (adminClient as any)
        .from('toast_venue_config')
        .insert({
          venue_id: venueId,
          restaurant_guid: body.toastGuid,
          client_id: body.toastClientId,
          client_secret_encrypted: encryptApiKey(body.toastClientSecret),
          is_active: true,
        });
    } else if (body.posType === 'upserve' && body.tipseeLocationUuid) {
      await (adminClient as any)
        .from('venue_tipsee_mapping')
        .insert({
          venue_id: venueId,
          tipsee_location_uuid: body.tipseeLocationUuid,
          tipsee_location_name: body.venueName,
          is_active: true,
        });
    } else if (body.posType === 'simphony' && body.simphonyLocRef) {
      await (adminClient as any)
        .from('simphony_bi_location_mapping')
        .insert({
          venue_id: venueId,
          loc_ref: body.simphonyLocRef,
          org_identifier: body.simphonyOrgIdentifier || '',
        });
    }

    // ── 4. Location config ───────────────────────────────────────────────
    await (adminClient as any)
      .from('location_config')
      .insert({
        venue_id: venueId,
        open_hour: body.serviceStartHour ?? 17,
        close_hour: body.serviceEndHour ?? 23,
        closed_weekdays: body.closedWeekdays || [],
        covers_per_server_target: body.coversPerServer ?? 16,
        covers_per_bartender_target: body.coversPerBartender ?? 30,
      });

    // ── 5. Sales pace settings ───────────────────────────────────────────
    const posHasLivePolling = body.posType !== 'manual';
    await (adminClient as any)
      .from('sales_pace_settings')
      .insert({
        venue_id: venueId,
        polling_interval_seconds: 300,
        service_start_hour: body.serviceStartHour ?? 17,
        service_end_hour: body.serviceEndHour ?? 23,
        is_active: posHasLivePolling,
      });

    // ── 6. Comp settings (defaults) ──────────────────────────────────────
    // Only seed if this is a new org (existing orgs already have settings)
    if (body.orgMode === 'new') {
      await (adminClient as any)
        .from('comp_settings')
        .insert({
          org_id: orgId,
          version: 1,
          approved_reasons: [
            { name: 'Guest Recovery', requires_manager_approval: false, max_amount: 100 },
            { name: 'Staff Discount 20%', requires_manager_approval: false, max_amount: null },
            { name: 'Staff Discount 50%', requires_manager_approval: true, max_amount: null },
            { name: 'Goodwill', requires_manager_approval: false, max_amount: 75 },
            { name: 'DNL (Did Not Like)', requires_manager_approval: false, max_amount: 50 },
            { name: 'FOH Mistake', requires_manager_approval: false, max_amount: 75 },
            { name: 'BOH Mistake / Wrong Temp', requires_manager_approval: false, max_amount: 75 },
            { name: 'Manager Meal', requires_manager_approval: false, max_amount: 30 },
          ],
          is_active: true,
          effective_from: new Date().toISOString(),
        });

      // ── 7. Operational standards (defaults) ──────────────────────────────
      await (adminClient as any)
        .from('operational_standards')
        .insert({
          org_id: orgId,
          version: 1,
          is_active: true,
          effective_from: new Date().toISOString(),
        });
    }

    return NextResponse.json(
      { organization_id: orgId, venue_id: venueId },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Onboard error:', error);
    return NextResponse.json(
      { error: error.message || 'Onboarding failed' },
      { status: 500 }
    );
  }
}
