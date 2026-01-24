import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { guard } from '@/lib/route-guard';
import { rateLimit } from '@/lib/rate-limit';
import { extractInvoiceWithClaude, extractInvoiceFromPDF } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';

/**
 * Bulk invoice upload endpoint for external vendors (e.g., Michael Green)
 * Accepts multiple invoice files and creates individual invoices
 * Automatically resolves venues from delivery locations in OCR data
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':bulk-invoice-upload');

    // Authenticate via API key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.BULK_UPLOAD_API_KEY) {
      throw { status: 401, code: 'UNAUTHORIZED', message: 'Invalid or missing API key' };
    }

    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const organizationId = formData.get('organization_id') as string | null;

    if (!files || files.length === 0) {
      throw { status: 400, code: 'NO_FILES', message: 'No files provided' };
    }

    if (!organizationId) {
      throw { status: 400, code: 'NO_ORG', message: 'organization_id is required' };
    }

    // Validate organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single();

    if (orgError || !org) {
      throw { status: 404, code: 'ORG_NOT_FOUND', message: 'Organization not found' };
    }

    // Get all venues for this organization
    const { data: venues } = await supabase
      .from('venues')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!venues || venues.length === 0) {
      throw { status: 400, code: 'NO_VENUES', message: 'No active venues found for organization' };
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

    const results = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result: any = {
        fileName: file.name,
        index: i,
        success: false,
      };

      try {
        // File size validation
        if (file.size > MAX_FILE_SIZE) {
          result.error = `File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
          results.push(result);
          continue;
        }

        // MIME type validation
        if (!validTypes.includes(file.type)) {
          result.error = `Invalid file type: ${file.type}`;
          results.push(result);
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate magic bytes
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
          result.error = 'Unsupported file format';
          results.push(result);
          continue;
        }

        // Extract with OCR
        const isPDF = actualMimeType === 'application/pdf';
        const { invoice: rawInvoice } = isPDF
          ? await extractInvoiceFromPDF(buffer)
          : await extractInvoiceWithClaude(buffer, actualMimeType);

        const normalized = await normalizeOCR(rawInvoice, supabase);

        // Resolve venue from OCR or use first venue as fallback
        let venueId = normalized.venueId;
        let venueName = normalized.venueName;

        if (!venueId) {
          // If OCR didn't find venue, try to match delivery location to venues
          if (rawInvoice.deliveryLocation?.name) {
            const locationName = rawInvoice.deliveryLocation.name.toLowerCase();
            const matchedVenue = venues.find(v =>
              v.name.toLowerCase().includes(locationName) ||
              locationName.includes(v.name.toLowerCase())
            );

            if (matchedVenue) {
              venueId = matchedVenue.id;
              venueName = matchedVenue.name;
            }
          }

          // If still no venue, use the first venue (can be manually corrected later)
          if (!venueId && venues.length === 1) {
            venueId = venues[0].id;
            venueName = venues[0].name;
            normalized.warnings.push('Could not determine venue from invoice. Using default venue.');
          } else if (!venueId) {
            result.error = 'Could not determine venue from invoice. Multiple venues available - manual assignment required.';
            result.normalized = normalized;
            result.warnings = normalized.warnings;
            results.push(result);
            continue;
          }
        }

        // Resolve or create vendor
        let vendorId = normalized.vendorId;
        let vendorName = normalized.vendorName?.trim() || '';

        if (!vendorName || vendorName.toUpperCase() === 'UNKNOWN') {
          vendorName = `Unknown Vendor - Invoice ${normalized.invoiceNumber || new Date().toISOString()}`;
          normalized.warnings.push('Vendor name could not be extracted. Please update manually.');
        }

        if (!vendorId && vendorName) {
          const normalizedName = vendorName
            .toLowerCase()
            .replace(/[,\.]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          // Check if vendor exists
          const { data: existingVendor } = await supabase
            .from('vendors')
            .select('id')
            .eq('normalized_name', normalizedName)
            .maybeSingle();

          if (existingVendor) {
            vendorId = existingVendor.id;
          } else {
            // Create new vendor
            const { data: newVendor, error: vendorError } = await supabase
              .from('vendors')
              .insert({
                name: vendorName,
                normalized_name: normalizedName,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .select('id')
              .single();

            if (vendorError) {
              result.error = `Failed to create vendor: ${vendorError.message}`;
              results.push(result);
              continue;
            }

            vendorId = newVendor.id;
          }
        }

        if (!vendorId) {
          result.error = 'Could not determine vendor';
          results.push(result);
          continue;
        }

        // Upload file to storage
        const fileName = `${Date.now()}-${file.name}`;
        const { data: uploadData } = await supabase.storage
          .from('opsos-invoices')
          .upload(`raw/${fileName}`, buffer, {
            contentType: actualMimeType
          });

        const storagePath = uploadData?.path || null;

        // Prepare invoice data
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
          status: 'pending_approval',
        };

        const linesPayload = normalized.lines.map((line) => ({
          item_id: line.itemId || null,
          description: line.description,
          quantity: line.qty,
          unit_cost: line.unitCost,
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

        if (rpcError) {
          result.error = `Failed to create invoice: ${rpcError.message}`;
          results.push(result);
          continue;
        }

        result.success = true;
        result.invoiceId = invoiceId;
        result.invoiceNumber = normalized.invoiceNumber;
        result.vendorName = vendorName;
        result.venueName = venueName;
        result.totalAmount = normalized.totalAmount;
        result.warnings = normalized.warnings;
        result.storagePath = storagePath;

      } catch (error: any) {
        result.error = error.message || 'Processing failed';
      }

      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({
      success: successCount > 0,
      processed: results.length,
      successCount,
      failureCount,
      results,
      message: `Processed ${results.length} files: ${successCount} succeeded, ${failureCount} failed`,
    });
  });
}
