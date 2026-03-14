/**
 * Order Dispatch — Sends POs to vendors
 *
 * Closes the "POs drafted but never sent" gap. When a PO reaches
 * 'pending' status (auto-executed or manager-approved), the dispatch
 * module sends it to the vendor via email (Resend) or API.
 *
 * Dispatch flow:
 *   PO status → 'pending' → dispatch → 'ordered'
 *   Every dispatch is logged to po_dispatch_log for audit.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getResendClient, FROM_EMAIL } from '@/lib/email/resend';
import { recordDispatch } from '@/lib/database/procurement-agent';

// ── Types ──────────────────────────────────────────────────────

interface POForDispatch {
  id: string;
  order_number: string;
  venue_id: string;
  venue_name: string;
  vendor_id: string;
  vendor_name: string;
  vendor_email: string | null;
  entity_code: string | null;
  total_amount: number;
  delivery_date: string;
  line_items: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  org_id: string;
}

export interface DispatchResult {
  po_id: string;
  success: boolean;
  method: 'email' | 'api' | 'manual';
  error?: string;
}

// ── Core Dispatch ──────────────────────────────────────────

/**
 * Dispatch a single PO to its vendor.
 * Determines method (email, API, manual) based on vendor config.
 * Updates PO status to 'ordered' on success.
 */
export async function dispatchPurchaseOrder(poId: string): Promise<DispatchResult> {
  const po = await loadPOForDispatch(poId);
  if (!po) {
    return { po_id: poId, success: false, method: 'manual', error: 'PO not found or not in pending status' };
  }

  // Determine dispatch method
  if (po.vendor_email) {
    return dispatchViaEmail(po);
  }

  // No email — mark as manual dispatch needed
  await recordDispatch({
    purchase_order_id: po.id,
    org_id: po.org_id,
    dispatch_method: 'manual',
    dispatched_to: po.vendor_name,
    response_status: 'pending',
    response_body: { reason: 'No vendor email configured — manual dispatch required' },
  });

  return {
    po_id: po.id,
    success: false,
    method: 'manual',
    error: `No email for vendor "${po.vendor_name}" — manual dispatch needed`,
  };
}

/**
 * Dispatch all pending POs that haven't been dispatched yet.
 */
export async function dispatchPendingPOs(
  orgId?: string
): Promise<DispatchResult[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('purchase_orders')
    .select('id')
    .eq('status', 'pending')
    .not('agent_run_id', 'is', null); // only agent-generated POs

  if (orgId) {
    const { data: venues } = await (supabase as any)
      .from('venues')
      .select('id')
      .eq('organization_id', orgId);

    if (venues?.length) {
      query = query.in('venue_id', venues.map((v: any) => v.id));
    }
  }

  // Exclude already-dispatched POs
  const { data: pendingPOs } = await query;
  if (!pendingPOs || pendingPOs.length === 0) return [];

  // Check which ones already have dispatch logs
  const { data: dispatched } = await (supabase as any)
    .from('po_dispatch_log')
    .select('purchase_order_id')
    .in('purchase_order_id', pendingPOs.map((p: any) => p.id))
    .eq('response_status', 'sent');

  const dispatchedSet = new Set((dispatched || []).map((d: any) => d.purchase_order_id));
  const toDispatch = pendingPOs.filter((p: any) => !dispatchedSet.has(p.id));

  const results = await Promise.allSettled(
    toDispatch.map((po: any) => dispatchPurchaseOrder(po.id))
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { po_id: toDispatch[i].id, success: false, method: 'manual' as const, error: (r as any).reason?.message }
  );
}

// ── Email Dispatch ──────────────────────────────────────────

async function dispatchViaEmail(po: POForDispatch): Promise<DispatchResult> {
  try {
    const resend = getResendClient();
    const htmlBody = buildPOEmailHtml(po);

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: po.vendor_email!,
      subject: `Purchase Order ${po.order_number} — ${po.venue_name}`,
      html: htmlBody,
    });

    if (error) {
      await recordDispatch({
        purchase_order_id: po.id,
        org_id: po.org_id,
        dispatch_method: 'email',
        dispatched_to: po.vendor_email!,
        response_status: 'failed',
        response_body: { error: error.message },
      });

      return { po_id: po.id, success: false, method: 'email', error: error.message };
    }

    // Success — update PO status to 'ordered'
    const supabase = getServiceClient();
    await (supabase as any)
      .from('purchase_orders')
      .update({ status: 'ordered', updated_at: new Date().toISOString() })
      .eq('id', po.id);

    await recordDispatch({
      purchase_order_id: po.id,
      org_id: po.org_id,
      dispatch_method: 'email',
      dispatched_to: po.vendor_email!,
      response_status: 'sent',
    });

    return { po_id: po.id, success: true, method: 'email' };
  } catch (err: any) {
    await recordDispatch({
      purchase_order_id: po.id,
      org_id: po.org_id,
      dispatch_method: 'email',
      dispatched_to: po.vendor_email || 'unknown',
      response_status: 'failed',
      response_body: { error: err.message },
    });

    return { po_id: po.id, success: false, method: 'email', error: err.message };
  }
}

// ── Data Loading ──────────────────────────────────────────

async function loadPOForDispatch(poId: string): Promise<POForDispatch | null> {
  const supabase = getServiceClient();

  const { data: po } = await (supabase as any)
    .from('purchase_orders')
    .select(`
      id, order_number, venue_id, vendor_id,
      total_amount, delivery_date, entity_code, status,
      venues(name, organization_id),
      vendors(name, email)
    `)
    .eq('id', poId)
    .eq('status', 'pending')
    .single();

  if (!po) return null;

  const { data: lineItems } = await (supabase as any)
    .from('purchase_order_items')
    .select('quantity, unit_price, line_total, items(name)')
    .eq('purchase_order_id', poId);

  return {
    id: po.id,
    order_number: po.order_number,
    venue_id: po.venue_id,
    venue_name: po.venues?.name || 'Unknown Venue',
    vendor_id: po.vendor_id,
    vendor_name: po.vendors?.name || 'Unknown Vendor',
    vendor_email: po.vendors?.email || null,
    entity_code: po.entity_code,
    total_amount: po.total_amount,
    delivery_date: po.delivery_date,
    org_id: po.venues?.organization_id,
    line_items: (lineItems || []).map((li: any) => ({
      item_name: li.items?.name || 'Unknown Item',
      quantity: li.quantity,
      unit_price: li.unit_price,
      line_total: li.line_total || li.quantity * li.unit_price,
    })),
  };
}

// ── Email Template ──────────────────────────────────────────

function buildPOEmailHtml(po: POForDispatch): string {
  const lineRows = po.line_items
    .map(
      (li) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${li.item_name}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${li.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${li.unit_price.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${li.line_total.toFixed(2)}</td>
        </tr>`
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a1a">Purchase Order ${po.order_number}</h2>
      <p style="color:#666">
        <strong>From:</strong> ${po.venue_name}<br>
        <strong>To:</strong> ${po.vendor_name}<br>
        <strong>Delivery Date:</strong> ${po.delivery_date}<br>
        <strong>PO Number:</strong> ${po.order_number}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:left">Item</th>
            <th style="padding:8px;text-align:right">Qty</th>
            <th style="padding:8px;text-align:right">Unit Price</th>
            <th style="padding:8px;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:8px;text-align:right;font-weight:bold">Total:</td>
            <td style="padding:8px;text-align:right;font-weight:bold">$${po.total_amount.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="color:#999;font-size:12px">
        This purchase order was generated by KevaOS Procurement Agent.
        Please confirm receipt and expected delivery date.
      </p>
    </div>
  `;
}
