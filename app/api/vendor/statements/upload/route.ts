import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Vendor statement upload endpoint
 * For now, uploads the statement file and creates a basic record
 * OCR processing for statements can be added later
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':vendor-statement-upload');
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

    // Upload file to storage
    const fileName = `${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('opsos-invoices')
      .upload(`vendor/${vendorUser.vendor_id}/statements/${fileName}`, buffer, {
        contentType: actualMimeType
      });

    if (uploadError) throw uploadError;

    const statementUrl = supabase.storage
      .from('opsos-invoices')
      .getPublicUrl(uploadData.path).data.publicUrl;

    // For now, create a basic statement record
    // In the future, add OCR processing to extract statement details
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // If no venue specified, we'll need admin to assign it
    // For now, we require venue_id or will fail
    if (!venueId) {
      throw {
        status: 400,
        code: 'NO_VENUE',
        message: 'venue_id is required for statement uploads',
      };
    }

    const { data: statement, error: statementError } = await supabase
      .from('vendor_statements')
      .insert({
        vendor_id: vendorUser.vendor_id,
        venue_id: venueId,
        statement_period_start: firstDayOfMonth.toISOString().split('T')[0],
        statement_period_end: lastDayOfMonth.toISOString().split('T')[0],
        statement_total: 0, // Will be updated after OCR
        statement_pdf_url: statementUrl,
        imported_by: user.id,
      })
      .select()
      .single();

    if (statementError) throw statementError;

    return NextResponse.json({
      success: true,
      statementId: statement.id,
      message: 'Statement uploaded successfully. It will be processed and matched with invoices.',
    });
  });
}
