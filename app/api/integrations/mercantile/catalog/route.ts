/**
 * POST /api/integrations/mercantile/catalog
 *
 * Receives catalog sync from Mercantile Desk.
 * Authenticated via API key (not user session — called server-to-server).
 *
 * Upserts items in the KevaOS items table with mercantile_product_id tracking.
 * Only processes orgs that have a mercantile_integrations record.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Zod-like validation inline (avoid import issues in edge)
type CatalogItem = {
  product_id: string;
  variant_id: string;
  title: string;
  sku?: string;
  description?: string;
  thumbnail?: string;
  category?: string;
  unit_price?: number; // in cents
  manufacturer?: string;
  item_number?: string;
};

type CatalogSyncPayload = {
  mercantile_org_id: string;
  items: CatalogItem[];
  /** If true, items NOT in this payload are deactivated */
  full_sync?: boolean;
};

async function verifyApiKey(
  request: NextRequest,
  supabase: ReturnType<typeof createAdminClient>,
  mercantileOrgId: string
) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.slice(7);

  const { data: integration } = await supabase
    .from("mercantile_integrations")
    .select("*")
    .eq("mercantile_org_id", mercantileOrgId)
    .eq("api_key", apiKey)
    .single();

  return integration;
}

function mapCategory(mercantileCategory?: string): string {
  // Map Mercantile Desk categories to KevaOS item categories
  const categoryMap: Record<string, string> = {
    glassware: "smallwares",
    "paper goods": "disposables",
    collateral: "supplies",
    apparel: "supplies",
    signage: "supplies",
    packaging: "packaging",
    beverage: "beverage",
  };

  if (!mercantileCategory) return "supplies";
  const lower = mercantileCategory.toLowerCase();
  return categoryMap[lower] || "supplies";
}

export async function POST(request: NextRequest) {
  try {
    const body: CatalogSyncPayload = await request.json();

    if (!body.mercantile_org_id || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "Missing mercantile_org_id or items array" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify API key and get integration config
    const integration = await verifyApiKey(request, supabase, body.mercantile_org_id);
    if (!integration) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!integration.catalog_sync_enabled) {
      return NextResponse.json(
        { error: "Catalog sync is disabled for this organization" },
        { status: 403 }
      );
    }

    const orgId = integration.organization_id;
    const now = new Date().toISOString();
    const results = { created: 0, updated: 0, deactivated: 0, errors: [] as string[] };

    // Upsert each item
    for (const item of body.items) {
      if (!item.product_id || !item.title) {
        results.errors.push(`Skipped item: missing product_id or title`);
        continue;
      }

      // Check if item already exists (by mercantile_product_id + org)
      const { data: existing } = await supabase
        .from("items")
        .select("id")
        .eq("organization_id", orgId)
        .eq("mercantile_product_id", item.product_id)
        .maybeSingle();

      const itemData = {
        name: item.title,
        sku: item.sku || item.item_number || null,
        category: mapCategory(item.category),
        subcategory: item.category || null,
        base_uom: "ea" as const,
        organization_id: orgId,
        mercantile_product_id: item.product_id,
        mercantile_variant_id: item.variant_id,
        mercantile_synced_at: now,
        is_active: true,
        updated_at: now,
      };

      if (existing) {
        // Update
        const { error } = await supabase
          .from("items")
          .update(itemData)
          .eq("id", existing.id);

        if (error) {
          results.errors.push(`Failed to update ${item.title}: ${error.message}`);
        } else {
          results.updated++;
        }
      } else {
        // Insert
        const { error } = await supabase.from("items").insert({
          ...itemData,
          created_at: now,
        });

        if (error) {
          results.errors.push(`Failed to create ${item.title}: ${error.message}`);
        } else {
          results.created++;
        }
      }

      // Track cost if price provided
      if (item.unit_price && item.unit_price > 0) {
        const { data: opsItem } = await supabase
          .from("items")
          .select("id")
          .eq("organization_id", orgId)
          .eq("mercantile_product_id", item.product_id)
          .maybeSingle();

        if (opsItem) {
          await supabase.from("item_cost_history").upsert(
            {
              item_id: opsItem.id,
              effective_date: now.split("T")[0],
              unit_cost: item.unit_price / 100, // cents → dollars
              source: "vendor_catalog",
            },
            { onConflict: "item_id,effective_date" }
          );
        }
      }
    }

    // Full sync: deactivate items not in this payload
    if (body.full_sync) {
      const syncedProductIds = [...new Set(
        body.items
          .map((i) => i.product_id)
          .filter(Boolean)
      )];

      let deactivationQuery = supabase
        .from("items")
        .select("id")
        .eq("organization_id", orgId)
        .not("mercantile_product_id", "is", null);

      if (syncedProductIds.length > 0) {
        deactivationQuery = deactivationQuery.not(
          "mercantile_product_id",
          "in",
          syncedProductIds
        );
      }

      const { data: toDeactivate } = await deactivationQuery;

      if (toDeactivate && toDeactivate.length > 0) {
        const ids = toDeactivate.map((i) => i.id);
        const { error: deactivateError } = await supabase
          .from("items")
          .update({ is_active: false, updated_at: now })
          .in("id", ids);

        if (deactivateError) {
          results.errors.push(`Failed to deactivate ${ids.length} items: ${deactivateError.message}`);
        } else {
          results.deactivated = toDeactivate.length;
        }
      }
    }

    // Update last_sync_at
    await supabase
      .from("mercantile_integrations")
      .update({ last_sync_at: now, updated_at: now })
      .eq("id", integration.id);

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Mercantile catalog sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
