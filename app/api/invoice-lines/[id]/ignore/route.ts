import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/api/guard';

/**
 * POST /api/invoice-lines/:id/ignore
 * Mark an invoice line as ignored so it is excluded from bulk mapping.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('invoice_lines')
      .update({ is_ignored: true })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  });
}

