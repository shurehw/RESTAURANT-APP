/**
 * lib/actions/invoices.ts
 * Server actions for invoice CRUD operations.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateR365APExport } from '@/lib/integrations/r365';

const ApproveSchema = z.array(z.string().uuid());

/**
 * Approves multiple invoices by ID.
 * Updates status to 'approved' and creates ap_approval records.
 * @param ids - Array of invoice UUIDs
 */
export async function approveInvoices(ids: string[]) {
  const validated = ApproveSchema.parse(ids);
  const supabase = await createClient();

  // Get current user (placeholder - replace with actual auth)
  // const { data: { user } } = await supabase.auth.getUser();
  // const userId = user?.id;

  // Update invoices to approved
  const { error: updateError } = await supabase
    .from('invoices')
    .update({ status: 'approved' })
    .in('id', validated)
    .in('status', ['draft', 'pending_approval']); // Only approve non-approved

  if (updateError) {
    throw new Error(`Failed to approve invoices: ${updateError.message}`);
  }

  // Create approval records (optional: uncomment when auth is set up)
  // const approvals = validated.map(id => ({
  //   invoice_id: id,
  //   approver_user_id: userId,
  //   status: 'approved',
  //   approved_at: new Date().toISOString(),
  // }));
  // await supabase.from('ap_approvals').insert(approvals);

  revalidatePath('/invoices');
}

/**
 * Exports approved invoices to R365 CSV batch.
 * Generates CSV, uploads to Storage, and updates invoices.
 */
export async function exportToR365() {
  const supabase = await createClient();

  try {
    const path = await generateR365APExport(supabase);
    console.log('R365 export complete:', path);
    revalidatePath('/invoices');
    return { success: true, path };
  } catch (err: any) {
    console.error('R365 export error:', err);
    throw new Error(err.message || 'Export failed');
  }
}

/**
 * Creates a new invoice from normalized OCR data.
 */
export async function createInvoiceFromOCR(data: {
  vendorId: string;
  venueId: string;
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
  ocrConfidence: number;
  storagePath: string;
  lines: Array<{
    itemId?: string;
    description: string;
    qty: number;
    unitCost: number;
    glCode?: string;
    ocrConfidence: number;
  }>;
}) {
  const supabase = await createClient();

  // Insert invoice header
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      vendor_id: data.vendorId,
      venue_id: data.venueId,
      invoice_number: data.invoiceNumber,
      invoice_date: data.invoiceDate,
      due_date: data.dueDate,
      total_amount: data.totalAmount,
      ocr_confidence: data.ocrConfidence,
      storage_path: data.storagePath,
      status: data.ocrConfidence >= 0.9 ? 'pending_approval' : 'draft',
    })
    .select()
    .single();

  if (invError || !invoice) {
    throw new Error(`Failed to create invoice: ${invError?.message}`);
  }

  // Insert invoice lines
  const lines = data.lines.map((line) => ({
    invoice_id: invoice.id,
    item_id: line.itemId || null,
    description: line.description,
    qty: line.qty,
    unit_cost: line.unitCost,
    gl_code: line.glCode || null,
    ocr_confidence: line.ocrConfidence,
  }));

  const { error: linesError } = await supabase
    .from('invoice_lines')
    .insert(lines);

  if (linesError) {
    throw new Error(`Failed to create invoice lines: ${linesError.message}`);
  }

  // Update item_cost_history for mapped items
  const costUpdates = data.lines
    .filter((line) => line.itemId)
    .map((line) => ({
      item_id: line.itemId!,
      effective_date: data.invoiceDate,
      unit_cost: line.unitCost,
      source: 'invoice',
    }));

  if (costUpdates.length > 0) {
    await supabase.from('item_cost_history').insert(costUpdates);
  }

  revalidatePath('/invoices');
  return invoice;
}
