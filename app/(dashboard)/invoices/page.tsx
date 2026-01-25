/**
 * OpsOS Invoices Page
 * Table with approve/export actions, brass accents
 */

import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";
import { InvoicesClient } from "./InvoicesClient";

export default async function InvoicesPage() {
  // ========================================================================
  // Use centralized context resolver (handles both Supabase auth and legacy)
  // ========================================================================
  const ctx = await resolveContext();

  if (!ctx || !ctx.isAuthenticated) {
    return <div className="p-8">Not authenticated. Please log in.</div>;
  }

  if (!ctx.authUserId) {
    return <div className="p-8">No auth user found for this account. Please log out and log back in.</div>;
  }

  const orgId = ctx.orgId;
  
  console.log('Invoices page context:', { 
    authUserId: ctx.authUserId, 
    email: ctx.email, 
    orgId, 
    role: ctx.role 
  });

  if (!orgId) {
    return <div className="p-8">No organization associated with your account.</div>;
  }

  // ========================================================================
  // Data queries use admin client with explicit org filter
  // (Safe: org is derived from authenticated user's membership)
  // ========================================================================
  const adminClient = createAdminClient();

  // First get venues for this organization
  const { data: venues } = await adminClient
    .from("venues")
    .select("id, name")
    .eq('organization_id', orgId);

  const venueIds = venues?.map(v => v.id) || [];

  // Get invoices for these venues
  let invoices: any[] = [];
  let error = null;

  if (venueIds.length > 0) {
    const result = await adminClient
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        invoice_date,
        total_amount,
        status,
        ocr_confidence,
        match_confidence,
        auto_approved,
        total_variance_pct,
        variance_severity,
        purchase_order_id,
        vendor:vendor_id(name),
        venue:venue_id(name),
        purchase_orders:purchase_order_id(order_number)
      `
      )
      .in('venue_id', venueIds)
      .order("created_at", { ascending: false })
      .limit(50);

    invoices = result.data || [];
    error = result.error;
  }

  console.log('Invoices query result:', { count: invoices?.length, error, orgId, venueCount: venues?.length });

  return <InvoicesClient invoices={invoices || []} venues={venues || []} />;
}
