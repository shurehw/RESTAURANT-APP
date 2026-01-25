/**
 * POST /api/orders/[id]/receive
 * Manually receive items against a purchase order
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";
import { z } from "zod";

const receiveSchema = z.object({
  lines: z.array(
    z.object({
      line_id: z.string().uuid(),
      qty_received: z.number().positive(),
    })
  ).min(1),
  notes: z.string().optional(),
});

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

    const body = await request.json();
    const validated = receiveSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { lines, notes } = validated.data;
    const supabase = createAdminClient();

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from("purchase_orders")
      .select(`
        id, status, vendor_id, venue_id,
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

    // Check order status allows receiving
    if (!["ordered", "pending"].includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot receive against order with status: ${order.status}` },
        { status: 400 }
      );
    }

    // Fetch order lines to validate
    const lineIds = lines.map((l) => l.line_id);
    const { data: orderLines, error: linesError } = await supabase
      .from("purchase_order_items")
      .select("id, item_id, quantity, unit_price, qty_received, remaining_qty")
      .eq("purchase_order_id", id)
      .in("id", lineIds);

    if (linesError || !orderLines) {
      return NextResponse.json(
        { error: "Failed to fetch order lines" },
        { status: 500 }
      );
    }

    // Validate quantities don't exceed remaining
    const lineMap = new Map(orderLines.map((l) => [l.id, l]));
    for (const line of lines) {
      const orderLine = lineMap.get(line.line_id);
      if (!orderLine) {
        return NextResponse.json(
          { error: `Line ${line.line_id} not found on this order` },
          { status: 400 }
        );
      }
      if (line.qty_received > orderLine.remaining_qty) {
        return NextResponse.json(
          {
            error: `Quantity ${line.qty_received} exceeds remaining ${orderLine.remaining_qty} for line ${line.line_id}`,
          },
          { status: 400 }
        );
      }
    }

    // Create receipt
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert({
        purchase_order_id: id,
        vendor_id: order.vendor_id,
        venue_id: order.venue_id,
        received_by: ctx.authUserId,
        auto_generated: false,
        status: "manual",
        notes: notes || null,
      })
      .select("id")
      .single();

    if (receiptError || !receipt) {
      console.error("Error creating receipt:", receiptError);
      return NextResponse.json(
        { error: "Failed to create receipt" },
        { status: 500 }
      );
    }

    // Create receipt lines
    const receiptLines = lines.map((line) => {
      const orderLine = lineMap.get(line.line_id)!;
      return {
        receipt_id: receipt.id,
        purchase_order_item_id: line.line_id,
        item_id: orderLine.item_id,
        qty_received: line.qty_received,
        unit_cost: orderLine.unit_price,
        match_confidence: "high" as const,
      };
    });

    const { error: receiptLinesError } = await supabase
      .from("receipt_lines")
      .insert(receiptLines);

    if (receiptLinesError) {
      console.error("Error creating receipt lines:", receiptLinesError);
      // Try to clean up receipt
      await supabase.from("receipts").delete().eq("id", receipt.id);
      return NextResponse.json(
        { error: "Failed to create receipt lines" },
        { status: 500 }
      );
    }

    // Note: qty_received on purchase_order_items is updated automatically by trigger

    return NextResponse.json({
      success: true,
      receipt_id: receipt.id,
      lines_received: lines.length,
    });
  } catch (error) {
    console.error("Error in receive order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
