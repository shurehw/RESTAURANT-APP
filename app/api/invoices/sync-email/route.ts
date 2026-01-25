import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { searchInvoiceEmails, getEmailAttachments, downloadAttachment, markEmailAsRead } from '@/lib/microsoft-graph';
import { extractInvoiceWithClaude, extractInvoiceFromPDF } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';

/**
 * POST /api/invoices/sync-email
 * Syncs invoices from ap@hwoodgroup.com inbox (multi-tenant aware)
 * Looks for unread emails with attachments, processes invoice images/PDFs
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const supabase = await createClient();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venueId: requestedVenueId, limit = 20 } = body;

    // Search for invoice emails
    const emails = await searchInvoiceEmails(limit);

    const results = {
      total: emails.length,
      processed: 0,
      errors: 0,
      invoices: [] as any[],
    };

    for (const email of emails) {
      try {
        // Check if already synced
        const { data: existing } = await supabase
          .from('synced_emails')
          .select('id, processed')
          .eq('organization_id', orgId)
          .eq('email_message_id', email.id)
          .single();

        if (existing?.processed) {
          continue; // Skip already processed emails
        }

        // Get attachments
        const attachments = await getEmailAttachments(email.id);

        // Filter for invoice attachments (PDFs and images)
        const invoiceAttachments = attachments.filter((att: any) => {
          const contentType = att.contentType?.toLowerCase() || '';
          return contentType.includes('pdf') ||
                 contentType.includes('image') ||
                 contentType.includes('jpeg') ||
                 contentType.includes('png') ||
                 contentType.includes('jpg');
        });

        if (invoiceAttachments.length === 0) {
          continue; // Skip emails without invoice attachments
        }

        // Process first attachment
        const attachment = invoiceAttachments[0];
        const fileBuffer = await downloadAttachment(email.id, attachment.id);

        // Extract invoice data using Claude OCR
        const contentType = attachment.contentType?.toLowerCase() || '';
        const isPDF = contentType.includes('pdf');

        const ocrResult = isPDF
          ? await extractInvoiceFromPDF(fileBuffer)
          : await extractInvoiceWithClaude(fileBuffer, attachment.contentType || 'image/jpeg');

        // For email sync, we only process single invoices (use first if multi-invoice PDF)
        const rawInvoice = ocrResult.invoice || (ocrResult.invoices ? ocrResult.invoices[0] : undefined);

        if (!rawInvoice) {
          throw { status: 422, code: 'OCR_FAILED', message: 'Failed to extract invoice data from attachment' };
        }

        // Normalize and match to vendors/items
        const normalized = await normalizeOCR(rawInvoice, supabase);

        // Determine venue ID: use auto-detected, fallback to requested, or use first available
        let venueId = normalized.venueId || requestedVenueId || venueIds[0];

        // Verify user has access to this venue
        if (!venueIds.includes(venueId)) {
          throw { status: 403, code: 'FORBIDDEN', message: `No access to venue ${normalized.venueName || venueId}` };
        }

        // Upload file to storage
        const fileName = `${Date.now()}-${attachment.name}`;
        const storagePath = `email-sync/${fileName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(storagePath, fileBuffer, {
            contentType: attachment.contentType || (isPDF ? 'application/pdf' : 'image/jpeg'),
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
        }

        // Create invoice record
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
            storage_path: uploadData?.path || storagePath,
            notes: `Imported from email: ${email.subject}\nFrom: ${email.from?.emailAddress?.address}\n${normalized.venueName ? `Venue: ${normalized.venueName}` : ''}${normalized.warnings.length > 0 ? `\n\nWarnings:\n- ${normalized.warnings.join('\n- ')}` : ''}`,
          })
          .select('id')
          .single();

        if (invoiceError) throw invoiceError;

        // Insert line items
        const lineInserts = normalized.lines.map((line) => ({
          invoice_id: invoiceData.id,
          item_id: line.itemId || null, // Explicitly set to null if undefined
          description: line.description,
          qty: line.qty, // Use 'qty' not 'quantity' to match schema
          unit_cost: line.unitCost,
          // line_total is a generated column, don't send it
          ocr_confidence: line.ocrConfidence,
        }));

        await supabase.from('invoice_lines').insert(lineInserts);

        // Record synced email (create if doesn't exist)
        let syncedEmailId = existing?.id;

        if (!syncedEmailId) {
          const { data: syncedEmailData } = await supabase
            .from('synced_emails')
            .insert({
              email_sync_config_id: null, // TODO: Link to config
              organization_id: orgId,
              email_message_id: email.id,
              email_subject: email.subject,
              email_from: email.from?.emailAddress?.address,
              email_received_at: email.receivedDateTime,
            })
            .select('id')
            .single();

          syncedEmailId = syncedEmailData!.id;
        }

        // Save attachment metadata
        await supabase.from('email_attachments').insert({
          synced_email_id: syncedEmailId,
          attachment_name: attachment.name,
          attachment_type: attachment.contentType,
          attachment_size_bytes: fileBuffer.length,
          storage_path: uploadData?.path || storagePath,
          processed: true,
          ocr_confidence: normalized.ocrConfidence,
        });

        // Mark email as processed
        await supabase.rpc('mark_email_processed', {
          p_synced_email_id: syncedEmailId,
          p_invoice_id: invoiceData.id,
        });

        // Mark email as read
        await markEmailAsRead(email.id);

        results.processed++;
        results.invoices.push({
          invoiceId: invoiceData.id,
          emailSubject: email.subject,
          vendor: normalized.vendorName,
          total: normalized.totalAmount,
          storagePath: uploadData?.path || storagePath,
        });
      } catch (error: any) {
        console.error(`Error processing email ${email.id}:`, error);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  });
}
