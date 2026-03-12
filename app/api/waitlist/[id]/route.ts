/**
 * Waitlist Entry API
 *
 * PATCH /api/waitlist/:id — Update waitlist entry (status, notes, etc.)
 *
 * Body: { status?, seated_at?, reservation_id?, quoted_wait?, notes? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { updateWaitlistEntry } from '@/lib/database/floor-management';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const { id } = await params;
    const body = await request.json();
    const { status, seated_at, reservation_id, quoted_wait, notes } = body;

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (seated_at) updates.seated_at = seated_at;
    if (reservation_id) updates.reservation_id = reservation_id;
    if (quoted_wait !== undefined) updates.quoted_wait = quoted_wait;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const entry = await updateWaitlistEntry(id, updates);
    return NextResponse.json({ success: true, entry });
  });
}
