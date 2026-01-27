import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();
    const cookieStore = await cookies();

    const body = await request.json();
    const { item_id } = body;

    if (!item_id) {
      return NextResponse.json(
        { error: 'item_id is required' },
        { status: 400 }
      );
    }

    // Get user ID from cookie (custom auth) or Supabase session
    let userId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - No active session' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient();

    const parsePackConfigFromDescription = (desc: string): null | {
      pack_type: 'case' | 'bottle' | 'bag' | 'box' | 'each' | 'keg' | 'pail' | 'drum';
      units_per_pack: number;
      unit_size: number;
      unit_size_uom: string; // 'mL', 'L', 'oz', 'lb', 'gal', etc.
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

      // Pattern A: "CS/12" + size elsewhere like "750ML"
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

      // Pattern B: "12 750ML" or "12/750ML"
      const casePattern = lower.match(/\b(\d+)\s*\/\s*(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
      if (casePattern) {
        const units = Number(casePattern[1]);
        const unitSize = Number(casePattern[2]);
        const uom = normalizeUom(casePattern[4]);
        if (Number.isFinite(units) && units > 0 && Number.isFinite(unitSize) && unitSize > 0) {
          return { pack_type: 'case', units_per_pack: units, unit_size: unitSize, unit_size_uom: uom };
        }
      }

      // Pattern C: single size like "750ML" => bottle
      if (size) {
        const unitSize = Number(size[1]);
        const uom = normalizeUom(size[3]);
        if (Number.isFinite(unitSize) && unitSize > 0) {
          // Choose pack type by UOM
          const pack_type =
            uom === 'mL' || uom === 'L' || uom === 'oz' ? 'bottle' :
            uom === 'lb' || uom === 'kg' || uom === 'g' ? 'bag' :
            'each';
          return { pack_type, units_per_pack: 1, unit_size: unitSize, unit_size_uom: uom };
        }
      }

      return null;
    };

    // Get the invoice line details to learn vendor SKU
    const { data: invoiceLine } = await adminClient
      .from('invoice_lines')
      .select('description, vendor_item_code, invoice_id, invoices(vendor_id)')
      .eq('id', id)
      .single();

    if (!invoiceLine) {
      return NextResponse.json(
        { error: 'Invoice line not found' },
        { status: 404 }
      );
    }

    // Update the invoice line with the mapped item
    const { error } = await adminClient
      .from('invoice_lines')
      .update({ item_id })
      .eq('id', id);

    if (error) {
      console.error('Error mapping invoice line:', error);
      return NextResponse.json(
        { error: 'Failed to map item', details: error.message },
        { status: 500 }
      );
    }

    // Create vendor alias for future auto-matching (if we have vendor SKU)
    const vendorId = (invoiceLine.invoices as any)?.vendor_id;

    if (vendorId && invoiceLine.vendor_item_code) {
      // Extract pack size from description (e.g., "6/Cs", "750ml")
      const packSizeMatch = invoiceLine.description.match(/(\d+\/\d+|\d+\s*(ml|l|gal|oz|lb|cs|case))/i);
      const packSize = packSizeMatch ? packSizeMatch[0] : null;

      // Upsert vendor alias for future matching
      await adminClient
        .from('vendor_item_aliases')
        .upsert({
          vendor_id: vendorId,
          item_id: item_id,
          vendor_item_code: invoiceLine.vendor_item_code,
          vendor_description: invoiceLine.description,
          pack_size: packSize,
          is_active: true,
        }, {
          onConflict: 'vendor_id,vendor_item_code',
        });

      console.log(`✓ Learned vendor alias: ${invoiceLine.vendor_item_code} → item ${item_id}`);

      // If the mapped item has no pack configs yet, try to learn one from this invoice line.
      // This drives the "PACK CONFIGS" column in Products and helps conversion math.
      try {
        const packConfig = parsePackConfigFromDescription(invoiceLine.description);
        if (packConfig) {
          const { data: existing } = await adminClient
            .from('item_pack_configurations')
            .select('id')
            .eq('item_id', item_id)
            .eq('vendor_id', vendorId)
            .eq('vendor_item_code', invoiceLine.vendor_item_code)
            .eq('is_active', true)
            .limit(1);

          if (!existing || existing.length === 0) {
            const { error: packErr } = await adminClient
              .from('item_pack_configurations')
              .insert({
                item_id,
                pack_type: packConfig.pack_type,
                units_per_pack: packConfig.units_per_pack,
                unit_size: packConfig.unit_size,
                unit_size_uom: packConfig.unit_size_uom,
                vendor_id: vendorId,
                vendor_item_code: invoiceLine.vendor_item_code,
                is_active: true,
              });

            if (packErr) {
              console.warn('⚠️ Failed to create pack config:', packErr.message);
            } else {
              console.log(
                `✓ Learned pack config for item ${item_id}: ${packConfig.units_per_pack}/${packConfig.unit_size}${packConfig.unit_size_uom} (${packConfig.pack_type})`
              );
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Pack config learn failed:', e);
      }
    }

    return NextResponse.json({ success: true });
  });
}
