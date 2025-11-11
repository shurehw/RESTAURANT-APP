import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { parse } from 'csv-parse/sync';

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':pos-import');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) throw { status: 400, code: 'NO_FILE', message: 'No file provided' };
    if (!file.name.endsWith('.csv')) throw { status: 400, code: 'INVALID_TYPE', message: 'File must be CSV format' };

    const text = await file.text();
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true }) as any[];

    if (!records || records.length === 0) {
      throw { status: 400, code: 'EMPTY_FILE', message: 'CSV file is empty' };
    }

    const venueId = venueIds[0];
    const errors: string[] = [];
    const salesData: any[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const lineNum = i + 2;

      try {
        const date = row.date || row.sale_date || row.Date || row['Sale Date'];
        const itemCode = row.item_code || row.sku || row.plu || row.SKU || row.PLU || row['Item Code'];
        const itemName = row.item_name || row.name || row['Item Name'] || row.Name;
        const category = row.category || row.Category || row.menu_category || row['Menu Category'];
        const quantity = parseFloat(row.quantity || row.qty || row.Quantity || '0');
        const netSales = parseFloat(row.net_sales || row.net || row['Net Sales'] || row.total || row.Total || '0');
        const grossSales = parseFloat(row.gross_sales || row.gross || row['Gross Sales'] || netSales);

        if (!date) { errors.push(`Line ${lineNum}: Missing date`); continue; }
        if (!itemCode) { errors.push(`Line ${lineNum}: Missing item code/SKU`); continue; }
        if (!itemName) { errors.push(`Line ${lineNum}: Missing item name`); continue; }
        if (isNaN(quantity) || quantity <= 0) { errors.push(`Line ${lineNum}: Invalid quantity`); continue; }
        if (isNaN(netSales)) { errors.push(`Line ${lineNum}: Invalid net sales`); continue; }

        let normalizedDate: string;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          normalizedDate = date;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
          const [m, d, y] = date.split('/');
          normalizedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else {
          const parsed = new Date(date);
          if (isNaN(parsed.getTime())) { errors.push(`Line ${lineNum}: Invalid date format`); continue; }
          normalizedDate = parsed.toISOString().split('T')[0];
        }

        salesData.push({
          venue_id: venueId,
          sale_date: normalizedDate,
          pos_sku: itemCode.trim(),
          item_name: itemName.trim(),
          pos_category: category?.trim() || null,
          quantity,
          net_sales: netSales,
          gross_sales: grossSales,
          imported_by: user.id,
        });
      } catch (error) {
        errors.push(`Line ${lineNum}: ${error instanceof Error ? error.message : 'Parse error'}`);
      }
    }

    if (errors.length > records.length * 0.5) {
      throw { status: 400, code: 'TOO_MANY_ERRORS', message: 'Too many errors in CSV file', details: errors.slice(0, 10) };
    }

    const supabase = await createClient();
    if (salesData.length > 0) {
      const { error: insertError } = await supabase
        .from('pos_sales')
        .upsert(salesData, { onConflict: 'venue_id,sale_date,pos_sku', ignoreDuplicates: false });

      if (insertError) throw insertError;

      const uniqueItems = Array.from(
        new Map(salesData.map(s => [s.pos_sku, { pos_sku: s.pos_sku, pos_name: s.item_name, pos_category: s.pos_category }])).values()
      );

      const posItemsData = uniqueItems.map(item => ({
        venue_id: venueId,
        pos_sku: item.pos_sku,
        pos_name: item.pos_name,
        pos_category: item.pos_category || null,
        is_mapped: false,
      }));

      await supabase.from('pos_items').upsert(posItemsData, { onConflict: 'venue_id,pos_sku', ignoreDuplicates: true });
    }

    return NextResponse.json({
      success: true,
      imported: salesData.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  });
}
