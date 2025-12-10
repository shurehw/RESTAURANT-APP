import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { extractInvoiceWithClaude, extractInvoiceFromPDF } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';

/**
 * Vendor invoice upload endpoint with OCR processing
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':vendor-invoice-upload');
    const user = await requireUser();
    const supabase = await createClient();

    // Verify user is a vendor
    const { data: vendorUser, error: vendorError } = await supabase
      .from('vendor_users')
      .select('vendor_id, vendors(name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (vendorError || !vendorUser) {
      throw { status: 403, code: 'NOT_VENDOR', message: 'You do not have vendor access' };
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const venueId = formData.get('venue_id') as string | null;

    if (!file) throw { status: 400, code: 'NO_FILE', message: 'No file provided' };

    // File size validation: 10MB limit
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
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

    // Check magic bytes for actual file type
    const magicBytes = buffer.slice(0, 4).toString('hex');
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

    // Process with OCR
    const isPDF = actualMimeType === 'application/pdf';
    const { invoice: rawInvoice } = isPDF
      ? await extractInvoiceFromPDF(buffer)
      : await extractInvoiceWithClaude(buffer, actualMimeType);

    const normalized = await normalizeOCR(rawInvoice, supabase);

    // Upload file to storage
    const fileName = `${Date.now()}-${file.name}`;
    const { data: uploadData } = await supabase.storage
      .from('opsos-invoices')
      .upload(`vendor/${vendorUser.vendor_id}/${fileName}`, buffer, {
        contentType: actualMimeType
      });

    const imageUrl = uploadData
      ? supabase.storage.from('opsos-invoices').getPublicUrl(uploadData.path).data.publicUrl
      : null;

    // Determine venue_id from OCR if not provided
    let finalVenueId = venueId;
    if (!finalVenueId && normalized.venueId) {
      finalVenueId = normalized.venueId;
    }

    // If still no venue, we'll need to leave it null or error
    if (!finalVenueId) {
      // For vendor uploads without venue detection, we could either:
      // 1. Require manual venue selection later
      // 2. Create a "pending venue assignment" status
      // For now, we'll allow null venue_id and let admin assign it
    }

    // Prepare invoice data
    const invoicePayload = {
      venue_id: finalVenueId,
      vendor_id: vendorUser.vendor_id,
      invoice_number: normalized.invoiceNumber,
      invoice_date: normalized.invoiceDate,
      due_date: normalized.dueDate,
      total_amount: normalized.totalAmount,
      ocr_confidence: normalized.ocrConfidence,
      ocr_raw_json: rawInvoice,
      image_url: imageUrl,
      status: 'pending_approval', // Vendor uploads start as pending
    };

    const linesPayload = normalized.lines.map((line) => ({
      item_id: line.itemId || null, // Explicitly set to null if undefined
      description: line.description,
      quantity: line.qty,
      unit_cost: line.unitCost,
      // line_total is a generated column, don't send it
      ocr_confidence: line.ocrConfidence,
    }));

    // Create invoice with lines
    const { data: invoiceId, error: rpcError } = await supabase.rpc(
      'create_invoice_with_lines',
      {
        invoice_data: invoicePayload,
        lines_data: linesPayload,
      }
    );

    if (rpcError) throw rpcError;

    return NextResponse.json({
      success: true,
      invoiceId,
      normalized,
      warnings: normalized.warnings,
      imageUrl,
      message: 'Invoice uploaded and processed successfully. It will be reviewed by the venue team.',
    });
  });
}
