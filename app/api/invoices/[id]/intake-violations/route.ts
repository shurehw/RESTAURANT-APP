import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getViolationsForInvoice } from '@/lib/enforcement/intake-policy';

/**
 * GET /api/invoices/[id]/intake-violations
 * Returns all intake policy violations for a specific invoice.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const violations = await getViolationsForInvoice(id);
  return NextResponse.json({ violations });
}
