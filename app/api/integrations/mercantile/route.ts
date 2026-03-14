/**
 * GET/POST /api/integrations/mercantile
 *
 * Manage Mercantile Desk integration settings for the current org.
 * Authenticated via user session (org admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only owner/admin can view integration settings
    if (!ctx.isPlatformAdmin && !["owner", "admin"].includes(ctx.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data: integration } = await supabase
      .from("mercantile_integrations")
      .select("*")
      .eq("organization_id", ctx.orgId)
      .maybeSingle();

    return NextResponse.json({
      integration: integration
        ? {
            id: integration.id,
            mercantile_org_id: integration.mercantile_org_id,
            api_key_last4: integration.api_key
              ? `...${integration.api_key.slice(-4)}`
              : null,
            catalog_sync_enabled: integration.catalog_sync_enabled,
            enforce_catalog_only: integration.enforce_catalog_only,
            default_vendor_id: integration.default_vendor_id,
            last_sync_at: integration.last_sync_at,
            created_at: integration.created_at,
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching mercantile integration:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!ctx.isPlatformAdmin && !["owner", "admin"].includes(ctx.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const supabase = createAdminClient();

    const {
      mercantile_org_id,
      catalog_sync_enabled,
      enforce_catalog_only,
      default_vendor_id,
      regenerate_api_key,
    } = body;

    // Check if integration already exists
    const { data: existing } = await supabase
      .from("mercantile_integrations")
      .select("id, api_key")
      .eq("organization_id", ctx.orgId)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      // Update
      const updateData: Record<string, any> = {
        updated_at: now,
      };

      if (mercantile_org_id !== undefined) {
        if (!mercantile_org_id) {
          return NextResponse.json(
            { error: "mercantile_org_id cannot be empty" },
            { status: 400 }
          );
        }
        updateData.mercantile_org_id = mercantile_org_id;
      }
      if (catalog_sync_enabled !== undefined)
        updateData.catalog_sync_enabled = catalog_sync_enabled;
      if (enforce_catalog_only !== undefined)
        updateData.enforce_catalog_only = enforce_catalog_only;
      if (default_vendor_id !== undefined)
        updateData.default_vendor_id = default_vendor_id;
      if (regenerate_api_key)
        updateData.api_key = crypto.randomBytes(32).toString("hex");

      const { data: updated, error } = await supabase
        .from("mercantile_integrations")
        .update(updateData)
        .eq("id", existing.id)
        .select("id, api_key, mercantile_org_id, catalog_sync_enabled, enforce_catalog_only, default_vendor_id, last_sync_at")
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to update integration" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        integration: {
          ...updated,
          api_key: regenerate_api_key ? updated.api_key : undefined,
          api_key_last4: `...${updated.api_key.slice(-4)}`,
        },
      });
    } else {
      // Create new
      if (!mercantile_org_id) {
        return NextResponse.json(
          { error: "mercantile_org_id is required" },
          { status: 400 }
        );
      }

      const apiKey = crypto.randomBytes(32).toString("hex");

      const { data: created, error } = await supabase
        .from("mercantile_integrations")
        .insert({
          organization_id: ctx.orgId,
          mercantile_org_id,
          api_key: apiKey,
          catalog_sync_enabled: catalog_sync_enabled ?? true,
          enforce_catalog_only: enforce_catalog_only ?? true,
          default_vendor_id: default_vendor_id || null,
          created_at: now,
          updated_at: now,
        })
        .select("id, api_key, mercantile_org_id, catalog_sync_enabled, enforce_catalog_only, default_vendor_id")
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to create integration" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        integration: {
          ...created,
          api_key: apiKey, // Show full key on first creation
          api_key_last4: `...${apiKey.slice(-4)}`,
        },
      });
    }
  } catch (error) {
    console.error("Error managing mercantile integration:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
