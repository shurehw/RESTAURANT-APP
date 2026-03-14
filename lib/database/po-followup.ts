/**
 * PO Follow-up Scheduling & Execution
 *
 * Manages the post-order lifecycle:
 *   T-48h → Vendor confirmation request
 *   T-24h → Escalation if no confirmation (notify manager)
 *   T-4h  → At-risk alert, trigger backup sourcing
 *   T+4h  → Missed delivery → debit memo draft, vendor scorecard hit
 *
 * Follow-ups are persisted records, not in-memory timers.
 * A polling endpoint processes pending followups every 30 minutes.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export type FollowupType =
  | 'confirmation_request'
  | 'confirmation_escalation'
  | 'at_risk_alert'
  | 'missed_delivery'
  | 'debit_memo_draft';

export interface FollowupResult {
  followup_id: string;
  purchase_order_id: string;
  followup_type: FollowupType;
  action_taken: string;
  skipped_reason?: string;
}

export interface VendorConfirmation {
  purchase_order_id: string;
  confirmed_by?: string;
  confirmation_method: 'email' | 'phone' | 'portal' | 'auto';
  estimated_delivery_date?: string;
  notes?: string;
}

// ── Schedule Follow-ups ──────────────────────────────────────

/**
 * Schedule the full followup cadence for a PO.
 * Called when a PO is dispatched (status → 'ordered').
 */
export async function scheduleFollowups(
  poId: string,
  orgId: string,
  deliveryDate: string
): Promise<void> {
  const supabase = getServiceClient();
  const deliveryMs = new Date(deliveryDate + 'T12:00:00Z').getTime(); // noon on delivery day

  const followups = [
    {
      purchase_order_id: poId,
      org_id: orgId,
      followup_type: 'confirmation_request',
      scheduled_at: new Date(deliveryMs - 48 * 3600000).toISOString(), // T-48h
    },
    {
      purchase_order_id: poId,
      org_id: orgId,
      followup_type: 'confirmation_escalation',
      scheduled_at: new Date(deliveryMs - 24 * 3600000).toISOString(), // T-24h
    },
    {
      purchase_order_id: poId,
      org_id: orgId,
      followup_type: 'at_risk_alert',
      scheduled_at: new Date(deliveryMs - 4 * 3600000).toISOString(), // T-4h
    },
    {
      purchase_order_id: poId,
      org_id: orgId,
      followup_type: 'missed_delivery',
      scheduled_at: new Date(deliveryMs + 4 * 3600000).toISOString(), // T+4h
    },
  ];

  const { error } = await (supabase as any)
    .from('po_followups')
    .insert(followups);

  if (error) {
    console.error('[POFollowup] Error scheduling followups:', error.message);
  }
}

/**
 * Cancel all pending followups for a PO (e.g., when received or cancelled).
 */
export async function cancelFollowups(poId: string): Promise<void> {
  const supabase = getServiceClient();

  await (supabase as any)
    .from('po_followups')
    .update({ status: 'cancelled' })
    .eq('purchase_order_id', poId)
    .eq('status', 'pending');
}

// ── Execute Pending Follow-ups ──────────────────────────────

/**
 * Process all pending followups whose scheduled_at has passed.
 * Called by the followup polling endpoint every 30 minutes.
 */
export async function executePendingFollowups(): Promise<FollowupResult[]> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const results: FollowupResult[] = [];

  // Get pending followups that are due
  const { data: pending } = await (supabase as any)
    .from('po_followups')
    .select(`
      id, purchase_order_id, org_id, followup_type,
      purchase_orders!inner(
        id, status, vendor_id, venue_id, order_number, delivery_date, total_amount,
        vendors(name, email),
        venues(name)
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(100);

  if (!pending || pending.length === 0) return [];

  for (const followup of pending) {
    const po = followup.purchase_orders;
    const result = await executeFollowup(followup, po);
    results.push(result);

    // Mark as executed
    await (supabase as any)
      .from('po_followups')
      .update({
        status: result.skipped_reason ? 'skipped' : 'executed',
        executed_at: now,
        result: {
          action_taken: result.action_taken,
          skipped_reason: result.skipped_reason || null,
        },
      })
      .eq('id', followup.id);
  }

  return results;
}

async function executeFollowup(
  followup: any,
  po: any
): Promise<FollowupResult> {
  const supabase = getServiceClient();
  const baseResult = {
    followup_id: followup.id,
    purchase_order_id: followup.purchase_order_id,
    followup_type: followup.followup_type as FollowupType,
  };

  // If PO is already received or cancelled, skip
  if (po.status === 'received' || po.status === 'cancelled') {
    return { ...baseResult, action_taken: 'none', skipped_reason: `PO status is ${po.status}` };
  }

  // Check if vendor has confirmed
  const { data: confirmation } = await (supabase as any)
    .from('vendor_confirmations')
    .select('id')
    .eq('purchase_order_id', followup.purchase_order_id)
    .maybeSingle();

  const hasConfirmation = !!confirmation;

  switch (followup.followup_type) {
    case 'confirmation_request': {
      if (hasConfirmation) {
        return { ...baseResult, action_taken: 'none', skipped_reason: 'Vendor already confirmed' };
      }
      // Send confirmation request notification
      const { broadcastNotification } = await import('@/lib/notifications/dispatcher');
      await broadcastNotification({
        orgId: followup.org_id,
        venueId: po.venue_id,
        targetRole: 'manager',
        type: 'po_approval_needed',
        severity: 'info',
        title: `PO ${po.order_number} — Awaiting Vendor Confirmation`,
        body: `${po.vendors?.name || 'Vendor'} has not confirmed PO ${po.order_number} ($${po.total_amount}). Delivery expected ${po.delivery_date}.`,
        actionUrl: '/admin/procurement',
        sourceTable: 'purchase_orders',
        sourceId: po.id,
      });
      return { ...baseResult, action_taken: 'Sent confirmation request notification' };
    }

    case 'confirmation_escalation': {
      if (hasConfirmation) {
        return { ...baseResult, action_taken: 'none', skipped_reason: 'Vendor already confirmed' };
      }
      const { broadcastNotification } = await import('@/lib/notifications/dispatcher');
      await broadcastNotification({
        orgId: followup.org_id,
        venueId: po.venue_id,
        targetRole: 'manager',
        type: 'po_approval_needed',
        severity: 'warning',
        title: `PO ${po.order_number} — No Vendor Confirmation (24h to delivery)`,
        body: `${po.vendors?.name || 'Vendor'} has not confirmed PO ${po.order_number} ($${po.total_amount}). Delivery expected tomorrow. Consider calling the vendor directly.`,
        actionUrl: '/admin/procurement',
        sourceTable: 'purchase_orders',
        sourceId: po.id,
      });
      return { ...baseResult, action_taken: 'Sent escalation notification to manager' };
    }

    case 'at_risk_alert': {
      if (hasConfirmation) {
        return { ...baseResult, action_taken: 'none', skipped_reason: 'Vendor confirmed — not at risk' };
      }
      const { broadcastNotification } = await import('@/lib/notifications/dispatcher');
      await broadcastNotification({
        orgId: followup.org_id,
        venueId: po.venue_id,
        targetRole: 'admin',
        type: 'procurement_anomaly',
        severity: 'critical',
        title: `PO ${po.order_number} — AT RISK (4h to delivery)`,
        body: `${po.vendors?.name || 'Vendor'} has not confirmed PO ${po.order_number} ($${po.total_amount}). Delivery expected in ~4 hours. Recommend backup sourcing.`,
        actionUrl: '/admin/procurement',
        sourceTable: 'purchase_orders',
        sourceId: po.id,
      });
      return { ...baseResult, action_taken: 'Sent at-risk critical alert' };
    }

    case 'missed_delivery': {
      // Check if PO was received in the meantime
      if (po.status === 'received') {
        return { ...baseResult, action_taken: 'none', skipped_reason: 'PO was received' };
      }

      const { broadcastNotification } = await import('@/lib/notifications/dispatcher');
      await broadcastNotification({
        orgId: followup.org_id,
        venueId: po.venue_id,
        targetRole: 'admin',
        type: 'procurement_anomaly',
        severity: 'critical',
        title: `PO ${po.order_number} — MISSED DELIVERY`,
        body: `${po.vendors?.name || 'Vendor'} missed delivery for PO ${po.order_number} ($${po.total_amount}). Debit memo draft staged. Vendor scorecard will be updated.`,
        actionUrl: '/admin/procurement',
        sourceTable: 'purchase_orders',
        sourceId: po.id,
      });

      // Create a delivery receipt with 0 received (feeds into supplier scorecard)
      await (supabase as any)
        .from('delivery_receipts')
        .insert({
          venue_id: po.venue_id,
          vendor_id: po.vendor_id,
          purchase_order_id: po.id,
          delivery_date: po.delivery_date,
          expected_delivery_date: po.delivery_date,
          po_total: po.total_amount,
          received_total: 0,
          notes: 'Missed delivery — auto-generated by procurement agent',
        });

      return { ...baseResult, action_taken: 'Sent missed delivery alert, created zero-receipt for scorecard' };
    }

    default:
      return { ...baseResult, action_taken: 'none', skipped_reason: `Unknown followup type: ${followup.followup_type}` };
  }
}

// ── Vendor Confirmations ──────────────────────────────────────

/**
 * Record a vendor's confirmation of a PO.
 */
export async function recordVendorConfirmation(
  confirmation: VendorConfirmation
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('vendor_confirmations')
    .upsert(
      {
        purchase_order_id: confirmation.purchase_order_id,
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmation.confirmed_by || null,
        confirmation_method: confirmation.confirmation_method,
        estimated_delivery_date: confirmation.estimated_delivery_date || null,
        notes: confirmation.notes || null,
      },
      { onConflict: 'purchase_order_id' }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Check if a PO has been confirmed by the vendor.
 */
export async function hasVendorConfirmation(poId: string): Promise<boolean> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('vendor_confirmations')
    .select('id')
    .eq('purchase_order_id', poId)
    .maybeSingle();

  return !!data;
}
