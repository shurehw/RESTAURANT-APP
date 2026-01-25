import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { guard } from '@/lib/route-guard';
import { rateLimit } from '@/lib/rate-limit';
import { extractInvoiceWithClaude, extractInvoiceFromPDF } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':invoice-ocr');
    const supabase = await createClient();

    // Try Supabase auth first
    const { data: { user: authUser } } = await supabase.auth.getUser();

    // Fallback to cookie auth
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get('user_id');

    if (!authUser && !userIdCookie?.value) {
      throw { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
    }

    const customUserId = userIdCookie?.value;

    // Get organization and venues
    let orgId: string | undefined;
    let venueIds: string[] = [];

    if (authUser) {
      // Use Supabase auth user
      const { data: orgUsers } = await supabase
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', authUser.id)
        .eq('is_active', true);

      orgId = orgUsers?.[0]?.organization_id;

      if (orgId) {
        const { data: venues } = await supabase
          .from('venues')
          .select('id')
          .eq('organization_id', orgId);
        venueIds = venues?.map(v => v.id) || [];
      }
    } else if (customUserId) {
      // Use cookie auth - need to look up auth user from custom user
      const adminClient = createAdminClient();

      const { data: customUser } = await adminClient
        .from('users')
        .select('email')
        .eq('id', customUserId)
        .single();

      if (customUser?.email) {
        const { data: authUserId } = await adminClient
          .rpc('get_auth_user_id_by_email', { user_email: customUser.email });

        if (authUserId) {
          const { data: orgUsers } = await adminClient
            .from('organization_users')
            .select('organization_id')
            .eq('user_id', authUserId)
            .eq('is_active', true);

          orgId = orgUsers?.[0]?.organization_id;

          if (orgId) {
            const { data: venues } = await adminClient
              .from('venues')
              .select('id')
              .eq('organization_id', orgId);
            venueIds = venues?.map(v => v.id) || [];
          }
        }
      }
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const venueId = formData.get('venue_id') as string;
    const isPreopening = formData.get('is_preopening') === 'true';

    if (!file) throw { status: 400, code: 'NO_FILE', message: 'No file provided' };
    if (!venueId) throw { status: 400, code: 'NO_VENUE', message: 'venue_id is required' };

    // Check venue access
    if (!venueIds.includes(venueId)) {
      console.error('Venue access denied:', {
        requestedVenueId: venueId,
        userVenueIds: venueIds,
        orgId,
        authMethod: authUser ? 'supabase' : 'cookie',
        userId: authUser?.id || customUserId
      });
      throw {
        status: 403,
        code: 'FORBIDDEN',
        message: `You do not have access to this venue. Requested: ${venueId}, Available: ${venueIds.join(', ') || 'none'}`
      };
    }

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
    const ocrResult = isPDF
      ? await extractInvoiceFromPDF(buffer)
      : await extractInvoiceWithClaude(buffer, actualMimeType);

    // Check if we have multiple invoices
    const rawInvoices = ocrResult.invoices || [ocrResult.invoice!];
    const isMultiInvoice = rawInvoices.length > 1;

    console.log(`[OCR] Detected ${rawInvoices.length} invoice(s) in uploaded file`);

    // Process each invoice
    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < rawInvoices.length; i++) {
      const rawInvoice = rawInvoices[i];
      const invoiceIndex = i + 1;

      try {
        console.log(`[OCR] Processing invoice ${invoiceIndex}/${rawInvoices.length}...`);
        const result = await processInvoice(rawInvoice, venueId, isPreopening, file, buffer, supabase, invoiceIndex, rawInvoices.length);
        results.push(result);
      } catch (error: any) {
        console.error(`[OCR] Failed to process invoice ${invoiceIndex}:`, error);
        errors.push({
          invoiceNumber: rawInvoice.invoiceNumber || `Invoice ${invoiceIndex}`,
          vendor: rawInvoice.vendor || 'Unknown',
          error: error.message || error,
          code: error.code,
        });
      }
    }

    // Return multi-invoice result
    if (isMultiInvoice) {
      return NextResponse.json({
        success: results.length > 0,
        multiInvoice: true,
        total: rawInvoices.length,
        succeeded: results.length,
        failed: errors.length,
        results,
        errors,
      });
    }

    // Single invoice - throw error if failed, return result if succeeded
    if (errors.length > 0) {
      throw errors[0].error;
    }

    return NextResponse.json(results[0]);
  });
}

// Helper function to process a single invoice
async function processInvoice(
  rawInvoice: any,
  venueId: string,
  isPreopening: boolean,
  file: File,
  buffer: Buffer,
  supabase: any,
  invoiceIndex: number,
  totalInvoices: number
) {
    const normalized = await normalizeOCR(rawInvoice, supabase);

    // Validate and handle vendor
    let vendorId = normalized.vendorId;
    let vendorName = normalized.vendorName?.trim() || '';

    // If vendor name is empty or "UNKNOWN", create a placeholder
    if (!vendorName || vendorName.toUpperCase() === 'UNKNOWN') {
      vendorName = `Unknown Vendor - Invoice ${normalized.invoiceNumber || new Date().toISOString()}`;
      console.warn('[OCR Warning] Vendor name not extracted, using placeholder:', vendorName);
      normalized.warnings.push('Vendor name could not be extracted from invoice. Please update manually.');
    }

    // If vendor not found, create it using service role (bypasses RLS)
    if (!vendorId && vendorName) {
      const normalizedName = vendorName
        .toLowerCase()
        .replace(/[,\.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Use service role client to bypass RLS for vendor operations
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Check if vendor already exists first
      const { data: existingVendor } = await serviceClient
        .from('vendors')
        .select('id')
        .eq('normalized_name', normalizedName)
        .maybeSingle();

      if (existingVendor) {
        // Use existing vendor
        vendorId = existingVendor.id;
      } else {
        // Get organization_id from venue for new vendor
        const { data: venueData } = await serviceClient
          .from('venues')
          .select('organization_id')
          .eq('id', venueId)
          .single();

        if (!venueData?.organization_id) {
          throw {
            status: 400,
            code: 'MISSING_ORGANIZATION',
            message: 'Cannot create vendor: venue has no organization'
          };
        }

        // Create new vendor
        const { data: newVendor, error: vendorError } = await serviceClient
          .from('vendors')
          .insert({
            name: vendorName,
            normalized_name: normalizedName,
            organization_id: venueData.organization_id,
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
    }

    // Ensure vendor_id is set - invoice cannot be created without vendor
    if (!vendorId) {
      throw {
        status: 400,
        code: 'MISSING_VENDOR',
        message: 'Invoice must have a vendor. OCR failed to extract vendor information.'
      };
    }

    // Ensure venue_id is set - invoice must be associated with a venue
    if (!venueId) {
      throw {
        status: 400,
        code: 'MISSING_VENUE',
        message: 'Invoice must be associated with a venue. Please select a venue before uploading.'
      };
    }

    // For multi-invoice PDFs, append index to filename
    const baseFileName = file.name.replace(/\.pdf$/i, '');
    const fileName = totalInvoices > 1
      ? `${Date.now()}-${baseFileName}-invoice-${invoiceIndex}.pdf`
      : `${Date.now()}-${file.name}`;

    const { data: uploadData } = await supabase.storage
      .from('opsos-invoices')
      .upload(`raw/${fileName}`, buffer, { contentType: 'application/pdf' });

    const storagePath = uploadData?.path || null;

    // Prepare data for RPC
    const invoicePayload = {
      venue_id: venueId,
      vendor_id: vendorId,
      invoice_number: normalized.invoiceNumber,
      invoice_date: normalized.invoiceDate,
      due_date: normalized.dueDate,
      payment_terms: normalized.paymentTerms,
      total_amount: normalized.totalAmount,
      ocr_confidence: normalized.ocrConfidence,
      ocr_raw_json: rawInvoice,
      storage_path: storagePath,
      is_preopening: isPreopening,
    };

    // Map all lines (including qty: 0 for vendor tracking)
    const linesPayload = normalized.lines.map((line) => ({
      item_id: line.itemId || null, // Explicitly set to null if undefined
      vendor_item_code: line.vendorItemCode || null, // Vendor SKU from OCR
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

    if (rpcError) {
      // Provide better error messages for common issues
      if (rpcError.code === '23505') {
        // Unique constraint violation - duplicate invoice
        const invoiceNum = normalized.invoiceNumber || 'Unknown';
        const vendorName = normalized.vendorName || 'Unknown Vendor';
        throw {
          status: 409,
          code: 'DUPLICATE_INVOICE',
          message: `Duplicate invoice: ${invoiceNum} from ${vendorName} already exists in the system.`,
          details: {
            invoiceNumber: invoiceNum,
            vendorName: vendorName,
          }
        };
      }
      throw rpcError;
    }

    const needsReview = normalized.lines.some(l => l.matchType === 'none');
    return {
      success: true,
      invoiceId: invoiceId,
      invoiceNumber: normalized.invoiceNumber,
      vendor: normalized.vendorName,
      totalAmount: normalized.totalAmount,
      normalized,
      warnings: normalized.warnings,
      storagePath,
      needsReview,
      reviewUrl: `/invoices/${invoiceId}/review`,
    };
}
