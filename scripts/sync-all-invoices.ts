/**
 * Sync all invoices from ap@hwoodgroup.com
 * Direct implementation that bypasses API auth
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { searchInvoiceEmails, getEmailAttachments, downloadAttachment, markEmailAsRead } from '../lib/microsoft-graph';
import { extractInvoiceWithClaude, extractInvoiceFromPDF } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function syncAllInvoices() {
  console.log('\n📧 Syncing all invoices from ap@hwoodgroup.com...\n');

  // Find h.wood organization
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  if (!org) {
    console.error('❌ h.wood organization not found');
    return;
  }

  console.log(`✅ Organization: ${org.name}\n`);

  // Get all venues for h.wood
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('organization_id', org.id);

  if (!venues || venues.length === 0) {
    console.error('❌ No venues found for h.wood');
    return;
  }

  const venueIds = venues.map(v => v.id);
  console.log(`📍 Venues: ${venues.map(v => v.name).join(', ')}\n`);

  // Search for invoice emails
  console.log('🔍 Searching for invoice emails...\n');
  const emails = await searchInvoiceEmails(100);
  console.log(`Found ${emails.length} potential invoice emails\n`);

  const results = {
    total: emails.length,
    processed: 0,
    skipped: 0,
    errors: 0,
    invoices: [] as any[],
  };

  for (const email of emails) {
    try {
      console.log(`\n📧 Processing: ${email.subject}`);
      console.log(`   From: ${email.from?.emailAddress?.address}`);

      // Check if already synced
      const { data: existing } = await supabase
        .from('synced_emails')
        .select('id, processed')
        .eq('organization_id', org.id)
        .eq('email_message_id', email.id)
        .single();

      if (existing?.processed) {
        console.log('   ⏭️  Already processed, skipping');
        results.skipped++;
        continue;
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
        console.log('   ⏭️  No invoice attachments, skipping');
        results.skipped++;
        continue;
      }

      console.log(`   📎 Found ${invoiceAttachments.length} attachment(s)`);

      // Process first attachment
      const attachment = invoiceAttachments[0];
      console.log(`   📄 Processing: ${attachment.name}`);

      const fileBuffer = await downloadAttachment(email.id, attachment.id);
      console.log(`   ⬇️  Downloaded ${(fileBuffer.length / 1024).toFixed(2)} KB`);

      // Extract invoice data using Claude OCR
      const contentType = attachment.contentType?.toLowerCase() || '';
      const isPDF = contentType.includes('pdf');

      console.log(`   🤖 Running ${isPDF ? 'PDF' : 'image'} OCR...`);
      const { invoice: rawInvoice } = isPDF
        ? await extractInvoiceFromPDF(fileBuffer)
        : await extractInvoiceWithClaude(fileBuffer, attachment.contentType || 'image/jpeg');

      console.log(`   ✅ Extracted: ${rawInvoice.vendor} - Invoice #${rawInvoice.invoiceNumber}`);

      // Normalize and match to vendors/items
      const normalized = await normalizeOCR(rawInvoice, supabase);
      console.log(`   💰 Total: $${normalized.totalAmount}`);
      console.log(`   🏢 Venue: ${normalized.venueName || 'Unknown'}`);

      // Determine venue ID
      let venueId = normalized.venueId || venueIds[0];

      // Verify user has access to this venue
      if (!venueIds.includes(venueId)) {
        console.log(`   ⚠️  Venue not accessible, using default: ${venues[0].name}`);
        venueId = venueIds[0];
      }

      // Upload file to storage
      const fileName = `${Date.now()}-${attachment.name}`;
      const storagePath = `email-sync/${fileName}`;

      console.log(`   ⬆️  Uploading to storage...`);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(storagePath, fileBuffer, {
          contentType: attachment.contentType || (isPDF ? 'application/pdf' : 'image/jpeg'),
        });

      if (uploadError) {
        console.error('   ❌ Storage upload error:', uploadError);
      }

      // Create invoice record
      console.log(`   💾 Creating invoice record...`);
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

      if (invoiceError) {
        console.error('   ❌ Invoice creation error:', invoiceError);
        throw invoiceError;
      }

      // Insert line items
      console.log(`   📋 Creating ${normalized.lines.length} line items...`);
      const lineInserts = normalized.lines.map((line) => ({
        invoice_id: invoiceData.id,
        item_id: line.itemId || null,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unitCost,
        ocr_confidence: line.ocrConfidence,
      }));

      await supabase.from('invoice_lines').insert(lineInserts);

      // Record synced email (create if doesn't exist)
      let syncedEmailId = existing?.id;

      if (!syncedEmailId) {
        const { data: syncedEmailData } = await supabase
          .from('synced_emails')
          .insert({
            email_sync_config_id: null,
            organization_id: org.id,
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

      console.log(`   ✅ Complete! Invoice ID: ${invoiceData.id}`);

      results.processed++;
      results.invoices.push({
        invoiceId: invoiceData.id,
        emailSubject: email.subject,
        vendor: normalized.vendorName,
        total: normalized.totalAmount,
      });
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      results.errors++;
    }
  }

  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('✅ SYNC COMPLETE!');
  console.log('═══════════════════════════════════════════════════');
  console.log(`📊 Total emails: ${results.total}`);
  console.log(`✅ Processed: ${results.processed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`❌ Errors: ${results.errors}\n`);

  if (results.invoices.length > 0) {
    console.log('📄 Invoices created:');
    results.invoices.forEach((inv: any) => {
      console.log(`   • ${inv.vendor}: $${inv.total}`);
    });
    console.log();
  }
}

syncAllInvoices().catch(console.error);
