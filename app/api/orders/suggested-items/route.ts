/**
 * GET /api/orders/suggested-items
 * Returns items below reorder point for a given venue/vendor
 * Used to auto-populate purchase orders
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();

    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venue_id");
    const vendorId = searchParams.get("vendor_id");

    if (!venueId) {
      return NextResponse.json(
        { error: "venue_id is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify venue access
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id, name, organization_id")
      .eq("id", venueId)
      .single();

    if (venueError || !venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    if (!ctx.isPlatformAdmin && venue.organization_id !== ctx.orgId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get items below reorder point with par data
    // We can't use the view directly because we need more control
    let query = supabase
      .from("item_pars")
      .select(`
        id,
        par_level,
        reorder_point,
        reorder_quantity,
        item:items!inner(
          id,
          name,
          sku,
          category,
          base_uom,
          is_active
        )
      `)
      .eq("venue_id", venueId)
      .gt("reorder_point", 0);

    const { data: pars, error: parsError } = await query;

    if (parsError) {
      console.error("Error fetching pars:", parsError);
      return NextResponse.json(
        { error: "Failed to fetch par levels" },
        { status: 500 }
      );
    }

    // Get current inventory balances for these items
    const itemIds = pars?.map((p) => (p.item as any)?.[0]?.id || p.item).filter(Boolean) || [];
    
    if (itemIds.length === 0) {
      return NextResponse.json({ items: [], message: "No items with par levels configured" });
    }

    const { data: balances } = await supabase
      .from("inventory_balances")
      .select("item_id, quantity_on_hand, last_cost")
      .eq("venue_id", venueId)
      .in("item_id", itemIds);

    const balanceMap = new Map(
      (balances || []).map((b) => [b.item_id, b])
    );

    // Get vendor aliases if vendor specified (for expected prices)
    let vendorAliases: any[] = [];
    if (vendorId) {
      const { data: aliases } = await supabase
        .from("vendor_item_aliases")
        .select("item_id, last_unit_cost, vendor_item_code")
        .eq("vendor_id", vendorId)
        .eq("is_active", true)
        .in("item_id", itemIds);
      
      vendorAliases = aliases || [];
    }

    const aliasMap = new Map(vendorAliases.map((a) => [a.item_id, a]));

    // Build suggested items list
    const suggestedItems = pars
      .filter((par) => (par.item as any)?.[0]?.is_active)
      .map((par) => {
        const balance = balanceMap.get((par.item as any)?.[0]?.id);
        const alias = aliasMap.get((par.item as any)?.[0]?.id);
        const qtyOnHand = balance?.quantity_on_hand || 0;
        const lastCost = alias?.last_unit_cost || balance?.last_cost || 0;
        
        // Calculate suggested order quantity
        // Option 1: Use configured reorder_quantity
        // Option 2: Order up to par_level (par_level - qty_on_hand)
        const suggestedQty = par.reorder_quantity || Math.max(0, par.par_level - qtyOnHand);
        
        const belowReorder = qtyOnHand < par.reorder_point;

        return {
          item_id: (par.item as any)?.[0]?.id,
          item_name: (par.item as any)?.[0]?.name,
          sku: (par.item as any)?.[0]?.sku,
          category: (par.item as any)?.[0]?.category,
          base_uom: (par.item as any)?.[0]?.base_uom,
          qty_on_hand: qtyOnHand,
          reorder_point: par.reorder_point,
          par_level: par.par_level,
          suggested_qty: suggestedQty,
          last_cost: lastCost,
          estimated_total: suggestedQty * lastCost,
          vendor_item_code: alias?.vendor_item_code || null,
          below_reorder: belowReorder,
          urgency: belowReorder ? (qtyOnHand === 0 ? "critical" : "low") : "none",
        };
      })
      .filter((item) => item.below_reorder) // Only return items actually below reorder
      .sort((a, b) => {
        // Sort by urgency then by deficit
        if (a.urgency === "critical" && b.urgency !== "critical") return -1;
        if (b.urgency === "critical" && a.urgency !== "critical") return 1;
        return (a.reorder_point - a.qty_on_hand) - (b.reorder_point - b.qty_on_hand);
      });

    return NextResponse.json({
      items: suggestedItems,
      total_items: suggestedItems.length,
      estimated_order_total: suggestedItems.reduce((sum, i) => sum + i.estimated_total, 0),
    });
  } catch (error) {
    console.error("Error in suggested items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
