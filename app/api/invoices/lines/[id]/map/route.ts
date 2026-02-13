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

    const parsePackConfigFromDescription = (desc: string): null | {
      pack_type: 'case' | 'bottle' | 'bag' | 'box' | 'each' | 'keg' | 'pail' | 'drum';
      units_per_pack: number;
      unit_size: number;
      unit_size_uom: string;
    } => {
      const raw = desc || '';
      const lower = raw.toLowerCase();

      const normalizeUom = (uom: string) => {
        const u = uom.toLowerCase();
        if (u === 'ml') return 'mL';
        if (u === 'l' || u === 'lt' || u === 'ltr') return 'L';
        if (u === 'gal') return 'gal';
        if (u === 'qt') return 'qt';
        if (u === 'pt') return 'pt';
        if (u === 'oz') return 'oz';
        if (u === 'lb') return 'lb';
        if (u === 'kg') return 'kg';
        if (u === 'g') return 'g';
        return uom;
      };

      const csCount = lower.match(/\bcs\s*\/\s*(\d+)\b/i);
      const size = lower.match(/\b(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
      if (csCount && size) {
        const units = Number(csCount[1]);
        const unitSize = Number(size[1]);
        const uom = normalizeUom(size[3]);
        if (Number.isFinite(units) && units > 0 && Number.isFinite(unitSize) && unitSize > 0) {
          return { pack_type: 'case', units_per_pack: units, unit_size: unitSize, unit_size_uom: uom };
        }
      }

      const casePattern = lower.match(/\b(\d+)\s*\/\s*(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
      if (casePattern) {
        const units = Number(casePattern[1]);
        const unitSize = Number(casePattern[2]);
        const uom = normalizeUom(casePattern[4]);
        if (Number.isFinite(units) && units > 0 && Number.isFinite(unitSize) && unitSize > 0) {
          return { pack_type: 'case', units_per_pack: units, unit_size: unitSize, unit_size_uom: uom };
        }
      }

      if (size) {
        const unitSize = Number(size[1]);
        const uom = normalizeUom(size[3]);
        if (Number.isFinite(unitSize) && unitSize > 0) {
          const pack_type =
            uom === 'mL' || uom === 'L' || uom === 'oz' ? 'bottle' :
            uom === 'lb' || uom === 'kg' || uom === 'g' ? 'bag' :
            'each';
          return { pack_type, units_per_pack: 1, unit_size: unitSize, unit_size_uom: uom };
        }
      }

      return null;
    };

    // Get the invoice line details to extract vendor and pack size
    const { data: invoiceLine } = await supabase
      .from('invoice_lines')
      .select('description, invoice_id, vendor_item_code, invoices(vendor_id)')
      .eq('id', lineId)
      .single();

    if (!invoiceLine) {
      throw { status: 404, code: 'LINE_NOT_FOUND' };
    }

    // Extract pack size from description (e.g., "6/Cs", "4/1 GAL", "750mL")
    const packSizeMatch = invoiceLine.description.match(/(\d+\/\d+|\d+\s*(ml|l|gal|oz|lb|cs|case))/i);
    const packSize = packSizeMatch ? packSizeMatch[0] : null;

    const vendorId = (invoiceLine.invoices as any)?.vendor_id;

    // Update the invoice line with the mapped item
    const { error: updateError } = await supabase
      .from('invoice_lines')
      .update({ item_id: validated.item_id })
      .eq('id', lineId);

    if (updateError) throw updateError;

    // Create or update vendor_item_alias for future matching
    if (vendorId && invoiceLine.vendor_item_code) {
      await supabase
        .from('vendor_item_aliases')
        .upsert({
          vendor_id: vendorId,
          item_id: validated.item_id,
          vendor_item_code: invoiceLine.vendor_item_code,
          vendor_description: invoiceLine.description,
          pack_size: packSize,
          is_active: true,
        }, {
          onConflict: 'vendor_id,vendor_item_code',
        });

      // Best-effort: create a vendor-specific pack configuration when we can parse one.
      // If RLS blocks this insert, mapping still succeeds.
      try {
        const packConfig = parsePackConfigFromDescription(invoiceLine.description);
        if (packConfig) {
          const { data: existing } = await supabase
            .from('item_pack_configurations')
            .select('id')
            .eq('item_id', validated.item_id)
            .eq('vendor_id', vendorId)
            .eq('vendor_item_code', invoiceLine.vendor_item_code)
            .eq('is_active', true)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase
              .from('item_pack_configurations')
              .insert({
                item_id: validated.item_id,
                pack_type: packConfig.pack_type,
                units_per_pack: packConfig.units_per_pack,
                unit_size: packConfig.unit_size,
                unit_size_uom: packConfig.unit_size_uom,
                conversion_factor: packConfig.units_per_pack * packConfig.unit_size,
                vendor_id: vendorId,
                vendor_item_code: invoiceLine.vendor_item_code,
                is_active: true,
              });
          }
        }
      } catch (e) {
        console.warn('Pack config learn failed:', e);
      }
    }

    return NextResponse.json({ success: true });
  });
}
