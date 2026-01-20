import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * P0 FIX: No hardcoded fallbacks - fail hard if settings missing
 * Error codes:
 * - SETTINGS_MISSING: No settings row exists for tenant
 * - SETTINGS_QUERY_FAILED: Database query failed
 */

// GET: Fetch labor settings for current tenant
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        error: "Unauthorized",
        code: "UNAUTHORIZED"
      }, { status: 401 });
    }

    // Get user's tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({
        error: "No tenant found",
        code: "NO_TENANT"
      }, { status: 404 });
    }

    // Get labor settings for this tenant - NO FALLBACKS
    const { data: settings, error } = await supabase
      .from("proforma_settings")
      .select(
        `
        market_tier_low_multiplier,
        market_tier_mid_multiplier,
        market_tier_high_multiplier,
        tipped_min_wage_floor_pct,
        default_min_wage_city,
        default_tip_credit,
        default_market_tier,
        version,
        effective_from,
        effective_to
      `
      )
      .eq("org_id", profile.tenant_id)
      .eq("is_active", true)
      .is("effective_to", null)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching labor settings:", error);

      // P0: FAIL HARD - no fallback defaults
      return NextResponse.json({
        error: "Settings query failed. Contact administrator to initialize tenant settings.",
        code: "SETTINGS_QUERY_FAILED",
        details: error.message,
        remediation: "Run: INSERT INTO proforma_settings (org_id) VALUES ('[tenant_id]')"
      }, { status: 503 });
    }

    if (!settings) {
      // P0: Settings row missing - hard failure
      return NextResponse.json({
        error: "No settings configured for this organization. Contact administrator.",
        code: "SETTINGS_MISSING",
        remediation: "Administrator must initialize settings via Settings page or database seed."
      }, { status: 503 });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({
      error: error.message,
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}

// PATCH: Update labor settings for current tenant
// P0: Creates new version row instead of updating in place (for immutable audit trail)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        error: "Unauthorized",
        code: "UNAUTHORIZED"
      }, { status: 401 });
    }

    // Get user's tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({
        error: "No tenant found",
        code: "NO_TENANT"
      }, { status: 404 });
    }

    // P0: Check if trying to modify global settings (tenant_id IS NULL)
    // This should never happen for org_id-based settings, but defensive check
    if (body.tenant_id === null || body.org_id === null) {
      return NextResponse.json({
        error: "Cannot modify global settings. Create tenant-specific override instead.",
        code: "GLOBAL_IMMUTABLE",
        remediation: "Copy global settings to your organization and modify the copy."
      }, { status: 403 });
    }

    const {
      market_tier_low_multiplier,
      market_tier_mid_multiplier,
      market_tier_high_multiplier,
      tipped_min_wage_floor_pct,
      default_min_wage_city,
      default_tip_credit,
      default_market_tier,
    } = body;

    const updateData: any = {};
    if (market_tier_low_multiplier !== undefined)
      updateData.market_tier_low_multiplier = market_tier_low_multiplier;
    if (market_tier_mid_multiplier !== undefined)
      updateData.market_tier_mid_multiplier = market_tier_mid_multiplier;
    if (market_tier_high_multiplier !== undefined)
      updateData.market_tier_high_multiplier = market_tier_high_multiplier;
    if (tipped_min_wage_floor_pct !== undefined)
      updateData.tipped_min_wage_floor_pct = tipped_min_wage_floor_pct;
    if (default_min_wage_city !== undefined)
      updateData.default_min_wage_city = default_min_wage_city;
    if (default_tip_credit !== undefined)
      updateData.default_tip_credit = default_tip_credit;
    if (default_market_tier !== undefined)
      updateData.default_market_tier = default_market_tier;

    // P0: Set created_by for audit trail
    updateData.created_by = user.id;

    // Update creates new version via trigger (once enabled)
    // For now, direct update with updated_at
    const { data: settings, error } = await supabase
      .from("proforma_settings")
      .update(updateData)
      .eq("org_id", profile.tenant_id)
      .eq("is_active", true)
      .is("effective_to", null)
      .select()
      .single();

    if (error) {
      console.error("Error updating labor settings:", error);
      return NextResponse.json({
        error: error.message,
        code: "UPDATE_FAILED"
      }, { status: 500 });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({
      error: error.message,
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}
