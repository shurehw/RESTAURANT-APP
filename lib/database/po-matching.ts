/**
 * PO-to-Receipt Matching + 3-Way Match
 *
 * Closes two critical gaps:
 *   1. PO-to-receipt: Auto-match delivery receipt lines to PO lines
 *   2. 3-way match: PO → receipt → invoice reconciliation for AP
 *
 * Clean matches auto-sync to R365 AP. Variances hold for review
 * and create enforcement violations.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface LineMatch {
  po_item_id: string;
  receipt_line_id: string;
  item_id: string;
  item_name: string;
  ordered_qty: number;
  received_qty: number;
  variance: number;
  variance_pct: number;
  price_ordered: number;
  price_received: number;
}

export interface MatchResult {
  match_id: string;
  match_status: 'full' | 'partial' | 'unmatched';
  line_matches: LineMatch[];
  variance_amount: number;
  unmatched_po_lines: number;
  unmatched_receipt_lines: number;
}

export interface InvoiceMatchResult {
  match_id: string;
  match_status: 'clean' | 'variance' | 'dispute';
  po_amount: number;
  receipt_amount: number | null;
  invoice_amount: number;
  variance_amount: number;
  variance_pct: number;
}

// ── PO-to-Receipt Matching ──────────────────────────────────

/**
 * Auto-match a delivery receipt's line items to its linked PO's line items.
 * Matches by item_id. Flags shorts, overs, and substitutions.
 */
export async function matchReceiptToPO(
  receiptId: string
): Promise<MatchResult | null> {
  const supabase = getServiceClient();

  // Get receipt with its PO link
  const { data: receipt } = await (supabase as any)
    .from('delivery_receipts')
    .select('id, purchase_order_id, received_total')
    .eq('id', receiptId)
    .single();

  if (!receipt?.purchase_order_id) return null;

  // Get PO line items
  const { data: poItems } = await (supabase as any)
    .from('purchase_order_items')
    .select('id, item_id, quantity, unit_price, items(name)')
    .eq('purchase_order_id', receipt.purchase_order_id);

  // Get receipt line items
  const { data: receiptLines } = await (supabase as any)
    .from('delivery_receipt_lines')
    .select('id, item_id, ordered_qty, received_qty, unit_price_expected, unit_price_actual, items(name)')
    .eq('delivery_receipt_id', receiptId);

  if (!poItems || !receiptLines) return null;

  // Build item_id → PO item map
  const poItemMap = new Map<string, any>();
  for (const pi of poItems) {
    poItemMap.set(pi.item_id, pi);
  }

  // Build item_id → receipt line map
  const receiptLineMap = new Map<string, any>();
  for (const rl of receiptLines) {
    receiptLineMap.set(rl.item_id, rl);
  }

  // Match lines
  const lineMatches: LineMatch[] = [];
  let totalVariance = 0;
  const matchedPOItems = new Set<string>();
  const matchedReceiptLines = new Set<string>();

  for (const [itemId, poItem] of poItemMap) {
    const receiptLine = receiptLineMap.get(itemId);

    if (receiptLine) {
      const orderedQty = poItem.quantity;
      const receivedQty = receiptLine.received_qty;
      const qtyVariance = receivedQty - orderedQty;
      const priceVariance = (receiptLine.unit_price_actual - poItem.unit_price) * receivedQty;

      lineMatches.push({
        po_item_id: poItem.id,
        receipt_line_id: receiptLine.id,
        item_id: itemId,
        item_name: poItem.items?.name || itemId,
        ordered_qty: orderedQty,
        received_qty: receivedQty,
        variance: qtyVariance,
        variance_pct: orderedQty > 0 ? Math.round((qtyVariance / orderedQty) * 100) : 0,
        price_ordered: poItem.unit_price,
        price_received: receiptLine.unit_price_actual,
      });

      totalVariance += priceVariance + (qtyVariance * poItem.unit_price);
      matchedPOItems.add(itemId);
      matchedReceiptLines.add(itemId);
    }
  }

  const unmatchedPO = poItems.filter((pi: any) => !matchedPOItems.has(pi.item_id));
  const unmatchedReceipt = receiptLines.filter((rl: any) => !matchedReceiptLines.has(rl.item_id));

  // Determine match status
  let matchStatus: 'full' | 'partial' | 'unmatched';
  if (unmatchedPO.length === 0 && unmatchedReceipt.length === 0 && Math.abs(totalVariance) < 0.01) {
    matchStatus = 'full';
  } else if (lineMatches.length > 0) {
    matchStatus = 'partial';
  } else {
    matchStatus = 'unmatched';
  }

  // Store the match
  const { data: match, error } = await (supabase as any)
    .from('po_receipt_matches')
    .insert({
      purchase_order_id: receipt.purchase_order_id,
      delivery_receipt_id: receiptId,
      match_status: matchStatus,
      line_matches: lineMatches,
      variance_amount: Math.round(totalVariance * 100) / 100,
      matched_by: 'system',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[POMatching] Error storing match:', error.message);
    return null;
  }

  return {
    match_id: match.id,
    match_status: matchStatus,
    line_matches: lineMatches,
    variance_amount: Math.round(totalVariance * 100) / 100,
    unmatched_po_lines: unmatchedPO.length,
    unmatched_receipt_lines: unmatchedReceipt.length,
  };
}

/**
 * Auto-match all unmatched receipts that have a linked PO.
 */
export async function matchAllUnmatchedReceipts(
  venueId?: string
): Promise<MatchResult[]> {
  const supabase = getServiceClient();

  // Get receipts with PO links but no match record
  let query = (supabase as any)
    .from('delivery_receipts')
    .select('id, purchase_order_id')
    .not('purchase_order_id', 'is', null);

  if (venueId) {
    query = query.eq('venue_id', venueId);
  }

  const { data: receipts } = await query;
  if (!receipts || receipts.length === 0) return [];

  // Filter out already-matched receipts
  const { data: existingMatches } = await (supabase as any)
    .from('po_receipt_matches')
    .select('delivery_receipt_id')
    .in('delivery_receipt_id', receipts.map((r: any) => r.id));

  const matchedSet = new Set((existingMatches || []).map((m: any) => m.delivery_receipt_id));
  const unmatched = receipts.filter((r: any) => !matchedSet.has(r.id));

  const results: MatchResult[] = [];
  for (const receipt of unmatched) {
    const result = await matchReceiptToPO(receipt.id);
    if (result) results.push(result);
  }

  return results;
}

// ── 3-Way Match (PO → Receipt → Invoice) ──────────────────

/**
 * Match an invoice against a PO and its receipt.
 * Determines if amounts align or if there's a variance.
 */
export async function matchInvoiceToPO(
  orgId: string,
  poId: string,
  invoiceData: {
    invoice_number: string;
    invoice_date: string;
    invoice_amount: number;
  }
): Promise<InvoiceMatchResult> {
  const supabase = getServiceClient();

  // Get PO amount
  const { data: po } = await (supabase as any)
    .from('purchase_orders')
    .select('id, total_amount')
    .eq('id', poId)
    .single();

  if (!po) throw new Error(`PO ${poId} not found`);

  // Get receipt amount (if matched)
  const { data: receiptMatch } = await (supabase as any)
    .from('po_receipt_matches')
    .select('delivery_receipt_id, delivery_receipts(received_total)')
    .eq('purchase_order_id', poId)
    .maybeSingle();

  const receiptAmount = receiptMatch?.delivery_receipts?.received_total || null;
  const poAmount = parseFloat(po.total_amount);
  const invoiceAmount = invoiceData.invoice_amount;

  const variance = invoiceAmount - poAmount;
  const variancePct = poAmount > 0 ? Math.round((variance / poAmount) * 10000) / 100 : 0;

  // Determine match status
  // Clean: invoice within 1% of PO
  // Variance: invoice differs by 1-5%
  // Dispute: invoice differs by >5%
  let matchStatus: 'clean' | 'variance' | 'dispute';
  if (Math.abs(variancePct) <= 1) {
    matchStatus = 'clean';
  } else if (Math.abs(variancePct) <= 5) {
    matchStatus = 'variance';
  } else {
    matchStatus = 'dispute';
  }

  // R365 sync: clean matches auto-sync, others hold
  const r365SyncStatus = matchStatus === 'clean' ? 'pending' : 'held';

  const { data: match, error } = await (supabase as any)
    .from('invoice_matches')
    .insert({
      org_id: orgId,
      purchase_order_id: poId,
      delivery_receipt_id: receiptMatch?.delivery_receipt_id || null,
      invoice_number: invoiceData.invoice_number,
      invoice_date: invoiceData.invoice_date,
      invoice_amount: invoiceAmount,
      po_amount: poAmount,
      receipt_amount: receiptAmount,
      match_status: matchStatus,
      r365_sync_status: r365SyncStatus,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create invoice match: ${error.message}`);

  return {
    match_id: match.id,
    match_status: matchStatus,
    po_amount: poAmount,
    receipt_amount: receiptAmount,
    invoice_amount: invoiceAmount,
    variance_amount: Math.round(variance * 100) / 100,
    variance_pct: variancePct,
  };
}

/**
 * Get unmatched receipts for a venue (for manual matching UI).
 */
export async function getUnmatchedReceipts(
  venueId: string
): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('v_unmatched_receipts')
    .select('*')
    .eq('venue_id', venueId);

  return data || [];
}

/**
 * Get 3-way match summary for AP review.
 */
export async function getThreeWayMatchSummary(
  orgId: string,
  status?: string
): Promise<any[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('v_three_way_match_summary')
    .select('*')
    .eq('org_id', orgId);

  if (status) {
    query = query.eq('match_status', status);
  }

  const { data } = await query.order('created_at', { ascending: false }).limit(50);
  return data || [];
}
