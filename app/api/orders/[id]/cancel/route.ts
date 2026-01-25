/**
 * POST /api/orders/[id]/cancel
 * Cancel a purchase order
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

    // Check order can be cancelled (not already received or cancelled)
    if (order.status === "received") {
      return NextResponse.json(
        { error: "Cannot cancel a received order" },
        { status: 400 }
      );
    }

    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "Order is already cancelled" },
        { status: 400 }
      );
    }

    // Check if there are any receipts (partial receiving)
    const { count: receiptCount } = await supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", id);

    if (receiptCount && receiptCount > 0) {
      return NextResponse.json(
        { error: "Cannot cancel order with existing receipts. Items have already been received." },
        { status: 400 }
      );
    }

    // Update status to cancelled
    const { error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error cancelling order:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: "cancelled" });
  } catch (error) {
    console.error("Error in cancel order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
