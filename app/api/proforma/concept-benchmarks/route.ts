import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch concept benchmarks
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conceptType = searchParams.get("concept_type");
    const marketTier = searchParams.get("market_tier") || "MID";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    const tenantId = profile?.tenant_id || null;

    // If concept_type specified, get specific benchmarks using function
    if (conceptType) {
      const { data, error } = await supabase.rpc("get_concept_benchmarks", {
        p_concept_type: conceptType,
        p_market_tier: marketTier,
        p_tenant_id: tenantId,
      });

      if (error) {
        console.error("Error fetching concept benchmarks:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Function returns array with single row
      const benchmarks = data?.[0] || null;
      return NextResponse.json({ benchmarks });
    }

    // Otherwise, get all benchmarks for this tenant
    const { data: allBenchmarks, error } = await supabase
      .from("proforma_concept_benchmarks")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .eq("is_active", true)
      .lte("effective_date", new Date().toISOString().split("T")[0])
      .order("concept_type")
      .order("market_tier");

    if (error) {
      console.error("Error fetching all benchmarks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ benchmarks: allBenchmarks || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create new concept benchmark (admin only)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }

    const {
      concept_type,
      market_tier = "MID",
      sf_per_seat_min,
      sf_per_seat_max,
      seats_per_1k_sf_min,
      seats_per_1k_sf_max,
      dining_area_pct_min,
      dining_area_pct_max,
      kitchen_boh_pct_min,
      kitchen_boh_pct_max,
      storage_office_pct_min,
      storage_office_pct_max,
      guest_facing_pct_min,
      guest_facing_pct_max,
    } = body;

    if (!concept_type || !sf_per_seat_min || !sf_per_seat_max) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: benchmark, error } = await supabase
      .from("proforma_concept_benchmarks")
      .insert({
        tenant_id: profile.tenant_id,
        concept_type,
        market_tier,
        sf_per_seat_min,
        sf_per_seat_max,
        seats_per_1k_sf_min,
        seats_per_1k_sf_max,
        dining_area_pct_min,
        dining_area_pct_max,
        kitchen_boh_pct_min,
        kitchen_boh_pct_max,
        storage_office_pct_min,
        storage_office_pct_max,
        guest_facing_pct_min,
        guest_facing_pct_max,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating benchmark:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ benchmark });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Update concept benchmark
// P0: Enforce global immutability - prevent editing rows with tenant_id IS NULL
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

    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({
        error: "Missing id",
        code: "MISSING_ID"
      }, { status: 400 });
    }

    // P0: Check if row is global (tenant_id IS NULL) before allowing update
    const { data: existing, error: fetchError } = await supabase
      .from("proforma_concept_benchmarks")
      .select("tenant_id, concept_type, market_tier")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({
        error: "Benchmark not found",
        code: "NOT_FOUND"
      }, { status: 404 });
    }

    // P0: GLOBAL IMMUTABILITY CHECK
    if (existing.tenant_id === null) {
      return NextResponse.json({
        error: "Cannot modify global benchmarks. Create tenant-specific override instead.",
        code: "GLOBAL_IMMUTABLE",
        remediation: `Create a new benchmark for your organization with concept_type='${existing.concept_type}' and market_tier='${existing.market_tier}' instead of modifying the global default.`,
        action: "create_tenant_override"
      }, { status: 403 });
    }

    const { data: benchmark, error } = await supabase
      .from("proforma_concept_benchmarks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating benchmark:", error);
      return NextResponse.json({
        error: error.message,
        code: "UPDATE_FAILED"
      }, { status: 500 });
    }

    return NextResponse.json({ benchmark });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({
      error: error.message,
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}

// DELETE: Soft delete (set is_active = false)
// P0: Enforce global immutability - prevent deleting rows with tenant_id IS NULL
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({
        error: "Missing id",
        code: "MISSING_ID"
      }, { status: 400 });
    }

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

    // P0: Check if row is global before allowing delete
    const { data: existing, error: fetchError } = await supabase
      .from("proforma_concept_benchmarks")
      .select("tenant_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({
        error: "Benchmark not found",
        code: "NOT_FOUND"
      }, { status: 404 });
    }

    // P0: GLOBAL IMMUTABILITY CHECK
    if (existing.tenant_id === null) {
      return NextResponse.json({
        error: "Cannot delete global benchmarks. They are system-wide defaults.",
        code: "GLOBAL_IMMUTABLE",
        remediation: "Contact superadmin to manage global benchmarks."
      }, { status: 403 });
    }

    // Soft delete
    const { error } = await supabase
      .from("proforma_concept_benchmarks")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      console.error("Error deleting benchmark:", error);
      return NextResponse.json({
        error: error.message,
        code: "DELETE_FAILED"
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({
      error: error.message,
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}
