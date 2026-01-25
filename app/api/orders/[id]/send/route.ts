/**
 * POST /api/orders/[id]/send
 * Send a draft order to vendor (changes status from draft to ordered)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await resolveContext();

    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from("purchase_orders")
      .select(`
        id, status, venue_id,
        venue:venues(organization_id)
      `)
      .eq("id", id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify org access
    if (!ctx.isPlatformAdmin && order.venue?.[0]?.organization_id !== ctx.orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check order is in draft status
    if (order.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot send order with status: ${order.status}` },
        { status: 400 }
      );
    }

    // Check order has line items
    const { count: lineCount } = await supabase
      .from("purchase_order_items")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", id);

    if (!lineCount || lineCount === 0) {
      return NextResponse.json(
        { error: "Cannot send order with no items" },
        { status: 400 }
      );
    }

    // Update status to ordered
    const { error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        status: "ordered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error sending order:", updateError);
      return NextResponse.json(
        { error: "Failed to send order" },
        { status: 500 }
      );
    }

    // TODO: Future enhancement - send email/EDI to vendor

    return NextResponse.json({ success: true, status: "ordered" });
  } catch (error) {
    console.error("Error in send order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
