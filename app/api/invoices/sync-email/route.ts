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
    const { venueId, limit = 20 } = body;

    if (!venueId) {
      throw { status: 400, code: 'NO_VENUE', message: 'venue_id is required' };
    }

    // Verify user has access to this venue
    if (!venueIds.includes(venueId)) {
      throw { status: 403, code: 'FORBIDDEN', message: 'No access to this venue' };
    }

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

        const { invoice: rawInvoice } = isPDF
          ? await extractInvoiceFromPDF(fileBuffer)
          : await extractInvoiceWithClaude(fileBuffer, attachment.contentType || 'image/jpeg');

        // Normalize and match to vendors/items
        const normalized = await normalizeOCR(rawInvoice, supabase);

        // Upload file to storage
        const fileName = `${Date.now()}-${attachment.name}`;
        const { data: uploadData } = await supabase.storage
          .from('opsos-invoices')
          .upload(`email-sync/${fileName}`, fileBuffer, {
            contentType: attachment.contentType || (isPDF ? 'application/pdf' : 'image/jpeg'),
          });

        const fileUrl = uploadData
          ? supabase.storage.from('opsos-invoices').getPublicUrl(uploadData.path).data.publicUrl
          : null;

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
            image_url: fileUrl,
            notes: `Imported from email: ${email.subject}\nFrom: ${email.from?.emailAddress?.address}`,
          })
          .select('id')
          .single();

        if (invoiceError) throw invoiceError;

        // Insert line items
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

        // Record synced email
        await supabase.rpc('mark_email_processed', {
          p_synced_email_id: existing?.id || (await supabase
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
            .single()).data!.id,
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
          fileUrl,
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
