/**
 * Purchase Order Detail Page
 * View PO lines, receipts, variances, and manage lifecycle
 */

import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";
import { redirect, notFound } from "next/navigation";
import { OrderDetailClient } from "./OrderDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await resolveContext();

  if (!ctx || !ctx.isAuthenticated) {
    redirect("/login");
  }

  const supabase = createAdminClient();

  // Fetch purchase order with vendor and venue
  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      vendor:vendors(id, name),
      venue:venues(id, name, organization_id)
    `)
    .eq("id", id)
    .single();

  if (orderError || !order) {
    notFound();
  }

  // Verify org access (unless platform admin)
  if (!ctx.isPlatformAdmin && order.venue?.organization_id !== ctx.orgId) {
    redirect("/orders");
  }

  // Fetch PO line items with item details
  const { data: lines } = await supabase
    .from("purchase_order_items")
    .select(`
      *,
      item:items(id, name, sku, base_uom, category)
    `)
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: true });

  // Fetch receipts for this PO
  const { data: receipts } = await supabase
    .from("receipts")
    .select(`
      *,
      invoice:invoices(id, invoice_number, invoice_date)
    `)
    .eq("purchase_order_id", id)
    .order("received_at", { ascending: false });

  // Fetch linked invoices
  const { data: linkedInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, total_amount, status, variance_severity")
    .eq("purchase_order_id", id)
    .order("invoice_date", { ascending: false });

  // Fetch variances for linked invoices
  const invoiceIds = linkedInvoices?.map(i => i.id) || [];
  const { data: variances } = invoiceIds.length > 0 
    ? await supabase
        .from("invoice_variances")
        .select("*")
        .in("invoice_id", invoiceIds)
    : { data: [] };

  return (
    <OrderDetailClient
      order={order}
      lines={lines || []}
      receipts={receipts || []}
      linkedInvoices={linkedInvoices || []}
      variances={variances || []}
    />
  );
}
