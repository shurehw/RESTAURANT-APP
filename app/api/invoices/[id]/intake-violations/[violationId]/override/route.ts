import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveIntakeViolation } from '@/lib/enforcement/intake-policy';

/**
 * POST /api/invoices/[id]/intake-violations/[violationId]/override
 * Manager override for a blocked intake policy violation.
 * Requires admin/owner role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; violationId: string }> }
) {
  const { violationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check role — must be admin or owner
  const { data: orgUser } = await supabase
    .from('organization_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!orgUser || !['admin', 'owner'].includes(orgUser.role)) {
    return NextResponse.json(
      { error: 'Only admin or owner roles can override intake policy violations' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { reason } = body;

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json(
      { error: 'Override reason is required' },
      { status: 400 }
    );
  }

  const result = await resolveIntakeViolation(violationId, user.id, reason.trim());

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
