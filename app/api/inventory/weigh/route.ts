import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';
import { computeCountFromWeight, validateWeightReading } from '@/lib/utils/inventory-weight';

const weighSchema = z.object({
  venueId: uuid,
  countSessionId: uuid,
  skuId: uuid,
  weightG: z.number(),
});

const weighQuerySchema = z.object({
  skuId: uuid,
});

export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':inventory-weigh');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const body = await req.json();
    const validated = validate(weighSchema, body);
    assertVenueAccess(validated.venueId, venueIds);

    const supabase = await createClient();
    const { data: pw, error: pwError } = await supabase
      .from('product_weights')
      .select('size_ml, abv_percent, empty_g, full_g, empty_g_source, full_g_source')
      .eq('sku_id', validated.skuId)
      .maybeSingle();

    if (pwError) throw pwError;
    if (!pw || !pw.size_ml || !pw.abv_percent || !pw.empty_g) {
      throw { status: 400, code: 'MISSING_WEIGHT_DATA', message: 'Missing weight data for this SKU' };
    }

    const validation = validateWeightReading(Number(validated.weightG), Number(pw.empty_g), pw.full_g ? Number(pw.full_g) : null);
    if (!validation.valid) throw { status: 400, code: 'INVALID_WEIGHT', message: validation.error };

    const { fillRatio, remainingMl, method } = computeCountFromWeight(
      Number(validated.weightG),
      Number(pw.empty_g),
      pw.full_g ? Number(pw.full_g) : null,
      Number(pw.size_ml),
      Number(pw.abv_percent)
    );

    const { error: insertError } = await supabase
      .from('inventory_scale_readings')
      .insert({
        venue_id: validated.venueId,
        count_session_id: validated.countSessionId,
        sku_id: validated.skuId,
        weight_g: validated.weightG,
        fill_ratio: fillRatio,
        est_remaining_ml: remainingMl,
        computed_from: method,
        used_empty_g: pw.empty_g,
        used_full_g: pw.full_g,
        abv_percent: pw.abv_percent,
        captured_by: user.id,
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      fillRatio,
      remainingMl,
      method,
      weightG: validated.weightG,
      emptyG: pw.empty_g,
      fullG: pw.full_g,
      sizeMl: pw.size_ml,
      abvPercent: pw.abv_percent,
    });
  });
}

export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':inventory-weigh-get');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const searchParams = req.nextUrl.searchParams;
    const params = validateQuery(weighQuerySchema, searchParams);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('v_product_weights_status')
      .select('*')
      .eq('sku_id', params.skuId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw { status: 404, code: 'NOT_FOUND', message: 'Product weight not found' };

    return NextResponse.json(data);
  });
}
