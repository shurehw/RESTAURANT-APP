import { createAdminClient } from '@/lib/supabase/server';

type InvoiceLineCostRow = {
  id: string;
  item_id: string | null;
  unit_cost: number | null;
  is_ignored?: boolean | null;
  is_preopening?: boolean | null;
};

export async function syncApprovedInvoiceCostsToRecipes(
  invoiceId: string,
  options?: {
    lineIds?: string[];
    createdBy?: string | null;
  },
): Promise<{ inserted: number; skipped: number }> {
  const admin = createAdminClient();

  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .select('id, invoice_date, venue_id, status')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoice || invoice.status !== 'approved') {
    return { inserted: 0, skipped: 0 };
  }

  let linesQuery = admin
    .from('invoice_lines')
    .select('id, item_id, unit_cost, is_ignored, is_preopening')
    .eq('invoice_id', invoiceId);

  if (options?.lineIds?.length) {
    linesQuery = linesQuery.in('id', options.lineIds);
  }

  const { data: lines, error: linesError } = await linesQuery;
  if (linesError) throw linesError;

  const eligibleLines = ((lines || []) as InvoiceLineCostRow[]).filter((line) =>
    !!line.item_id &&
    line.unit_cost != null &&
    !line.is_ignored &&
    !line.is_preopening,
  );

  if (eligibleLines.length === 0) {
    return { inserted: 0, skipped: (lines || []).length };
  }

  const itemIds = [...new Set(eligibleLines.map((line) => line.item_id!).filter(Boolean))];

  const { data: existingRows, error: existingError } = await admin
    .from('item_cost_history')
    .select('item_id, effective_date, unit_cost, venue_id, source')
    .in('item_id', itemIds)
    .eq('effective_date', invoice.invoice_date)
    .eq('source', 'invoice')
    .eq('venue_id', invoice.venue_id);

  if (existingError) throw existingError;

  const existingKeys = new Set(
    (existingRows || []).map((row: any) =>
      `${row.item_id}:${row.effective_date}:${row.unit_cost}:${row.venue_id}:${row.source}`,
    ),
  );

  const inserts = eligibleLines
    .filter((line) => !existingKeys.has(
      `${line.item_id}:${invoice.invoice_date}:${line.unit_cost}:${invoice.venue_id}:invoice`,
    ))
    .map((line) => ({
      item_id: line.item_id!,
      effective_date: invoice.invoice_date,
      unit_cost: line.unit_cost!,
      source: 'invoice',
      venue_id: invoice.venue_id,
      created_by: options?.createdBy || null,
    }));

  if (inserts.length > 0) {
    const { error: insertError } = await admin
      .from('item_cost_history')
      .insert(inserts);
    if (insertError) throw insertError;
  }

  return {
    inserted: inserts.length,
    skipped: eligibleLines.length - inserts.length,
  };
}
