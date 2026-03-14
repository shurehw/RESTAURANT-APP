/**
 * POST /api/admin/toast-test
 *
 * Tests Toast API connectivity with provided credentials.
 * Used by the onboarding wizard to validate credentials before saving.
 *
 * Auth: Platform admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/requirePlatformAdmin';
import { testToastConnection } from '@/lib/integrations/toast';

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 401 }
    );
  }

  try {
    const { restaurant_guid, client_id, client_secret } = await request.json();

    if (!restaurant_guid || !client_id || !client_secret) {
      return NextResponse.json(
        { ok: false, error: 'restaurant_guid, client_id, and client_secret are required' },
        { status: 400 }
      );
    }

    const result = await testToastConnection(restaurant_guid, client_id, client_secret);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}
