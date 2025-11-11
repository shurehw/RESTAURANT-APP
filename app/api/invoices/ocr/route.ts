import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { extractInvoiceWithClaude } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':invoice-ocr');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const venueId = formData.get('venue_id') as string;

    if (!file) throw { status: 400, code: 'NO_FILE', message: 'No file provided' };
    if (!venueId) throw { status: 400, code: 'NO_VENUE', message: 'venue_id is required' };

    assertVenueAccess(venueId, venueIds);

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      throw { status: 400, code: 'INVALID_TYPE', message: 'Invalid file type' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { invoice: rawInvoice } = await extractInvoiceWithClaude(buffer, file.type);
    const supabase = await createClient();
    const normalized = await normalizeOCR(rawInvoice, supabase);

    const fileName = `${Date.now()}-${file.name}`;
    const { data: uploadData } = await supabase.storage
      .from('opsos-invoices')
      .upload(`raw/${fileName}`, buffer, { contentType: file.type });

    const imageUrl = uploadData
      ? supabase.storage.from('opsos-invoices').getPublicUrl(uploadData.path).data.publicUrl
      : null;

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        venue_id: venueId,
        vendor_id: normalized.vendorId,
        invoice_number: normalized.invoiceNumber,
        invoice_date: normalized.invoiceDate,
        due_date: normalized.dueDate,
        total_amount: normalized.totalAmount,
        status: 'draft',
        ocr_confidence: normalized.ocrConfidence,
        ocr_raw_json: rawInvoice,
        image_url: imageUrl,
      })
      .select('id')
      .single();

    if (invoiceError) throw invoiceError;

    const lineInserts = normalized.lines.map((line) => ({
      invoice_id: invoiceData.id,
      item_id: line.itemId,
      description: line.description,
      quantity: line.qty,
      unit_cost: line.unitCost,
      line_total: line.lineTotal,
      ocr_confidence: line.ocrConfidence,
    }));

    await supabase.from('invoice_lines').insert(lineInserts);

    const needsReview = normalized.lines.some(l => l.matchType === 'none');
    return NextResponse.json({
      success: true,
      invoiceId: invoiceData.id,
      normalized,
      warnings: normalized.warnings,
      imageUrl,
      needsReview,
      reviewUrl: `/invoices/${invoiceData.id}/review`,
    });
  });
}
