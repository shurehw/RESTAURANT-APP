/**
 * lib/integrations/r365.ts
 * Generates CSV export for Restaurant365 AP import.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

interface R365APLine {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  glCode: string;
  amount: string;
  entityId: string;
}

/**
 * Generates R365 AP batch CSV and uploads to Supabase Storage.
 * @param supabase - Supabase client (service role)
 * @returns Storage path to CSV file
 */
export async function generateR365APExport(
  supabase: SupabaseClient
): Promise<string> {
  const batchId = crypto.randomUUID();
  const batchDate = new Date().toISOString().split('T')[0];

  // 1. Fetch approved invoices not yet exported
  const { data: invoices, error: fetchError } = await supabase
    .from('invoices')
    .select(
      `
      id,
      invoice_number,
      invoice_date,
      venue:venues!inner(r365_entity_id),
      vendor:vendors!inner(r365_vendor_id),
      invoice_lines!inner(gl_code, line_total)
    `
    )
    .eq('status', 'approved')
    .is('r365_export_batch_id', null);

  if (fetchError) throw fetchError;

  if (!invoices || invoices.length === 0) {
    throw new Error('No approved invoices to export.');
  }

  // 2. Build CSV rows
  const rows: R365APLine[] = [];
  let totalAmount = 0;

  for (const inv of invoices as any[]) {
    const vendorId = inv.vendor?.r365_vendor_id;
    const entityId = inv.venue?.r365_entity_id;

    if (!vendorId || !entityId) {
      console.warn(
        `Skipping invoice ${inv.invoice_number}: missing R365 vendor or entity ID`
      );
      continue;
    }

    for (const line of inv.invoice_lines) {
      if (!line.gl_code) {
        console.warn(
          `Skipping line in invoice ${inv.invoice_number}: missing GL code`
        );
        continue;
      }

      rows.push({
        vendorId,
        invoiceNumber: inv.invoice_number || '',
        invoiceDate: inv.invoice_date,
        glCode: line.gl_code,
        amount: line.line_total.toFixed(2),
        entityId,
      });

      totalAmount += parseFloat(line.line_total);
    }
  }

  if (rows.length === 0) {
    throw new Error('No valid invoice lines to export.');
  }

  // 3. Generate CSV content
  const csvHeader =
    'VendorID,InvoiceNumber,InvoiceDate,GLCode,Amount,EntityID\n';
  const csvBody = rows
    .map(
      (r) =>
        `${r.vendorId},${r.invoiceNumber},${r.invoiceDate},${r.glCode},${r.amount},${r.entityId}`
    )
    .join('\n');
  const csvContent = csvHeader + csvBody;

  // 4. Upload to Supabase Storage
  const fileName = `r365_ap_${batchId}.csv`;
  const filePath = `exports/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('opsos-exports')
    .upload(filePath, csvContent, { contentType: 'text/csv' });

  if (uploadError) throw uploadError;

  // 5. Generate MD5 checksum
  const checksum = crypto.createHash('md5').update(csvContent).digest('hex');
  const checksumPath = `exports/r365_ap_${batchId}.md5`;

  await supabase.storage
    .from('opsos-exports')
    .upload(checksumPath, checksum, { contentType: 'text/plain' });

  // 6. Create batch record
  const { error: batchError } = await supabase
    .from('ap_export_batches')
    .insert({
      id: batchId,
      batch_date: batchDate,
      storage_path: filePath,
      checksum,
      invoice_count: invoices.length,
      total_amount: totalAmount,
    });

  if (batchError) throw batchError;

  // 7. Mark invoices as exported
  const invoiceIds = invoices.map((i: any) => i.id);
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      r365_export_batch_id: batchId,
      status: 'exported',
    })
    .in('id', invoiceIds);

  if (updateError) throw updateError;

  console.log(
    `R365 export complete: ${filePath} (${rows.length} lines, checksum: ${checksumPath})`
  );

  // 8. TODO: Send webhook notification to Finance team
  // await sendWebhookNotification({ batchId, filePath, checksumPath });

  return filePath;
}

/**
 * Placeholder for webhook notification to Finance.
 */
async function sendWebhookNotification(data: {
  batchId: string;
  filePath: string;
  checksumPath: string;
}) {
  const webhookUrl = process.env.R365_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error('Webhook notification failed:', err);
  }
}
