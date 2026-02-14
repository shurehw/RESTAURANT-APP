/**
 * Purchasing Authorizations API
 *
 * GET    /api/procurement/authorizations?org_id=xxx             — list all authorizations
 * GET    /api/procurement/authorizations?org_id=xxx&user_id=x   — single user's auth
 * PUT    /api/procurement/authorizations                        — create/update authorization
 * DELETE /api/procurement/authorizations?id=xxx                 — deactivate
 *
 * Auth: Supabase session (user-facing). Only org admins/owners can manage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  listPurchasingAuthorizations,
  getPurchasingAuthorization,
  upsertPurchasingAuthorization,
  deactivatePurchasingAuthorization,
} from '@/lib/database/procurement-settings';

// ── Helpers ─────────────────────────────────────────────────────

async function getAuthenticatedUser(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function verifyOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await (service as any)
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .in('role', ['admin', 'owner'])
    .maybeSingle();

  return !!data;
}

// ── GET ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = request.nextUrl.searchParams.get('org_id');
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    const targetUserId = request.nextUrl.searchParams.get('user_id');

    // Admin can list all; regular users can only view their own
    const isAdmin = await verifyOrgAdmin(user.id, orgId);

    if (targetUserId) {
      // Single user's authorization
      if (targetUserId !== user.id && !isAdmin) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const venueId = request.nextUrl.searchParams.get('venue_id') || '';
      const auth = await getPurchasingAuthorization(orgId, targetUserId, venueId);

      return NextResponse.json({
        success: true,
        data: auth,
      });
    }

    // List all authorizations (admin only)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const authorizations = await listPurchasingAuthorizations(orgId);

    return NextResponse.json({
      success: true,
      data: authorizations,
    });
  } catch (err: any) {
    console.error('[Purchasing Auth API] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

// ── PUT ─────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { org_id, user_id, venue_id, authorized_item_ids, notes } = body;

    if (!org_id || !user_id || !authorized_item_ids) {
      return NextResponse.json(
        { error: 'org_id, user_id, and authorized_item_ids are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(authorized_item_ids) || authorized_item_ids.length === 0) {
      return NextResponse.json(
        { error: 'authorized_item_ids must be a non-empty array of UUIDs' },
        { status: 400 }
      );
    }

    // Only admins/owners can manage authorizations
    const isAdmin = await verifyOrgAdmin(user.id, org_id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const result = await upsertPurchasingAuthorization({
      orgId: org_id,
      userId: user_id,
      venueId: venue_id || undefined,
      authorizedItemIds: authorized_item_ids,
      notes: notes || undefined,
      createdBy: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save authorization' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      message: 'Purchasing authorization saved',
    });
  } catch (err: any) {
    console.error('[Purchasing Auth API] PUT error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

// ── DELETE ───────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authId = request.nextUrl.searchParams.get('id');
    if (!authId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Look up the authorization to verify org admin access
    const service = getServiceClient();
    const { data: existing } = await (service as any)
      .from('purchasing_authorizations')
      .select('org_id')
      .eq('id', authId)
      .eq('is_active', true)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Authorization not found' }, { status: 404 });
    }

    const isAdmin = await verifyOrgAdmin(user.id, existing.org_id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const result = await deactivatePurchasingAuthorization(authId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to deactivate authorization' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Authorization deactivated',
    });
  } catch (err: any) {
    console.error('[Purchasing Auth API] DELETE error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
