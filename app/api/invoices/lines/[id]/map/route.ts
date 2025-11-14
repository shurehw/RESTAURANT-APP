import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const mapSchema = z.object({
  item_id: uuid,
});

export async function POST(request: NextRequest, context: RouteContext) {
  return guard(async () => {
    rateLimit(request, ':invoice-map');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const validated = validate(mapSchema, body);
    const { id: lineId } = await context.params;

    if (!/^[0-9a-f-]{36}$/i.test(lineId)) {
      throw { status: 400, code: 'INVALID_UUID' };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('invoice_lines')
      .update({ item_id: validated.item_id })
      .eq('id', lineId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  });
}
