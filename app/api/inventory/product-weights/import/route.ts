import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':product-weights-import');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await req.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows)) {
      throw { status: 400, code: 'INVALID_DATA', message: 'Invalid CSV data' };
    }

    const supabase = await createClient();
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const row of rows) {
      try {
        if (!row.sku_id || !row.size_ml || !row.abv_percent) {
          results.failed++;
          results.errors.push(`Missing required fields for row: ${JSON.stringify(row)}`);
          continue;
        }

        const { error } = await supabase.from('product_weights').upsert({
          sku_id: row.sku_id,
          upc_ean: row.upc_ean || null,
          brand: row.brand || null,
          product_name: row.product_name || null,
          size_ml: parseInt(row.size_ml),
          abv_percent: parseFloat(row.abv_percent),
          empty_g: row.tare_g ? parseFloat(row.tare_g) : null,
          empty_g_source: row.source || 'seed_list',
          empty_g_source_ref: row.source_ref || null,
          full_g: row.full_g ? parseFloat(row.full_g) : null,
          full_g_source: row.full_g ? 'seed_list' : null,
          verified_by: row.verified_by || null,
          verified_at: row.verified_at_iso || null,
        }, { onConflict: 'sku_id' });

        if (error) {
          results.failed++;
          results.errors.push(`SKU ${row.sku_id}: ${error.message}`);
        } else {
          results.success++;
        }
      } catch (rowError: any) {
        results.failed++;
        results.errors.push(`Row parse error: ${rowError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.success,
      failed: results.failed,
      errors: results.errors,
    });
  });
}

export async function GET() {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('v_product_weights_status')
      .select('*')
      .order('item_name');

    if (error) throw error;

    const headers = ['sku_id', 'upc_ean', 'brand', 'product_name', 'size_ml', 'abv_percent', 'tare_g', 'full_g', 'source', 'source_ref', 'status', 'reading_count'];
    const csvRows = [headers.join(',')];

    data?.forEach((row: any) => {
      const values = [
        row.sku_id, row.upc_ean || '', row.brand || '', row.product_name || row.item_name || '',
        row.size_ml || '', row.abv_percent || '', row.empty_g || '', row.full_g || '',
        row.empty_g_source || '', row.empty_g_source_ref || '', row.status || '', row.reading_count || 0,
      ];
      csvRows.push(values.map(v => `"${v}"`).join(','));
    });

    const csv = csvRows.join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="product-weights-export.csv"',
      },
    });
  });
}
