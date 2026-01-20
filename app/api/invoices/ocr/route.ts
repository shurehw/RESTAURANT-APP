import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { extractInvoiceWithClaude, extractInvoiceFromPDF } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';

export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':invoice-ocr');
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const venueId = formData.get('venue_id') as string;
    const isPreopening = formData.get('is_preopening') === 'true';

    if (!file) throw { status: 400, code: 'NO_FILE', message: 'No file provided' };
    if (!venueId) throw { status: 400, code: 'NO_VENUE', message: 'venue_id is required' };

    assertVenueAccess(venueId, venueIds);

    // File size validation: 10MB limit
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      throw {
        status: 400,
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      };
    }

    // MIME type validation
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      throw {
        status: 400,
        code: 'INVALID_TYPE',
        message: `Invalid file type: ${file.type}. Allowed: ${validTypes.join(', ')}`,
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Additional validation: Check magic bytes to prevent MIME spoofing
    const magicBytes = buffer.slice(0, 4).toString('hex');

    // Detect actual file type from magic bytes
    let actualMimeType: string;
    if (magicBytes.startsWith('ffd8ff')) {
      actualMimeType = 'image/jpeg';
    } else if (magicBytes.startsWith('89504e47')) {
      actualMimeType = 'image/png';
    } else if (magicBytes.startsWith('52494646')) {
      actualMimeType = 'image/webp';
    } else if (magicBytes.startsWith('25504446')) {
      actualMimeType = 'application/pdf';
    } else {
      throw {
        status: 400,
        code: 'INVALID_FILE_FORMAT',
        message: 'Unsupported file format. Only JPEG, PNG, WebP, and PDF are supported.',
      };
    }

    // Handle PDF or image (use detected MIME type, not declared)
    const isPDF = actualMimeType === 'application/pdf';
    const { invoice: rawInvoice } = isPDF
      ? await extractInvoiceFromPDF(buffer)
      : await extractInvoiceWithClaude(buffer, actualMimeType);
    const supabase = await createClient();
    const normalized = await normalizeOCR(rawInvoice, supabase);

    // If vendor not found, create it using service role (bypasses RLS)
    let vendorId = normalized.vendorId;
    if (!vendorId && normalized.vendorName) {
      const normalizedName = normalized.vendorName
        .toLowerCase()
        .replace(/[,\.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Use service role client to bypass RLS for vendor creation
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: newVendor, error: vendorError } = await serviceClient
        .from('vendors')
        .insert({
          name: normalized.vendorName,
          normalized_name: normalizedName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (vendorError) {
        console.error('Failed to create vendor:', vendorError);
        throw { status: 500, code: 'VENDOR_CREATE_FAILED', message: `Failed to create vendor: ${vendorError.message}` };
      }

      vendorId = newVendor.id;
    }

    const fileName = `${Date.now()}-${file.name}`;
    const { data: uploadData } = await supabase.storage
      .from('opsos-invoices')
      .upload(`raw/${fileName}`, buffer, { contentType: file.type });

    const imageUrl = uploadData
      ? supabase.storage.from('opsos-invoices').getPublicUrl(uploadData.path).data.publicUrl
      : null;

    // Prepare data for RPC
    const invoicePayload = {
      venue_id: venueId,
      vendor_id: vendorId,
      invoice_number: normalized.invoiceNumber,
      invoice_date: normalized.invoiceDate,
      due_date: normalized.dueDate,
      total_amount: normalized.totalAmount,
      ocr_confidence: normalized.ocrConfidence,
      ocr_raw_json: rawInvoice,
      image_url: imageUrl,
      is_preopening: isPreopening,
    };

    const linesPayload = normalized.lines.map((line) => ({
      item_id: line.itemId || null, // Explicitly set to null if undefined
      description: line.description,
      quantity: line.qty,
      unit_cost: line.unitCost,
      // line_total is a generated column, don't send it
      ocr_confidence: line.ocrConfidence,
    }));

    // Call RPC
    const { data: invoiceId, error: rpcError } = await supabase.rpc(
      'create_invoice_with_lines',
      {
        invoice_data: invoicePayload,
        lines_data: linesPayload,
      }
    );

    if (rpcError) throw rpcError;

    const needsReview = normalized.lines.some(l => l.matchType === 'none');
    return NextResponse.json({
      success: true,
      invoiceId: invoiceId,
      normalized,
      warnings: normalized.warnings,
      imageUrl,
      needsReview,
      reviewUrl: `/invoices/${invoiceId}/review`,
    });
  });
}
