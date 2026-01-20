import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch city wage presets
export async function GET(request: Request) {
  try {
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

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }

    // Get presets for this tenant (including global presets with tenant_id = NULL)
    const { data: presets, error } = await supabase
      .from("proforma_city_wage_presets")
      .select("*")
      .or(`tenant_id.eq.${profile.tenant_id},tenant_id.is.null`)
      .eq("is_active", true)
      .order("city_name");

    if (error) {
      console.error("Error fetching city presets:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ presets: presets || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create new city wage preset
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

    const { city_name, state_code, min_wage, tip_credit, market_tier } = body;

    if (!city_name || !state_code || min_wage === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: preset, error } = await supabase
      .from("proforma_city_wage_presets")
      .insert({
        tenant_id: profile.tenant_id,
        city_name,
        state_code,
        min_wage,
        tip_credit: tip_credit ?? 0.0,
        market_tier: market_tier ?? "MID",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating city preset:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ preset });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Update city wage preset
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, city_name, state_code, min_wage, tip_credit, market_tier, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // P0: Check if row is global (tenant_id IS NULL) before allowing update
    const { data: existing, error: fetchError } = await supabase
      .from("proforma_city_wage_presets")
      .select("tenant_id, city_name, state_code")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching city preset:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // P0: GLOBAL IMMUTABILITY CHECK
    if (existing.tenant_id === null) {
      return NextResponse.json({
        error: "Cannot modify global city wage presets. Create tenant-specific override instead.",
        code: "GLOBAL_IMMUTABLE",
        remediation: `Create a new city wage preset for your organization with city='${existing.city_name}, ${existing.state_code}' instead of modifying the global default.`,
        action: "create_tenant_override"
      }, { status: 403 });
    }

    const updateData: any = {};
    if (city_name !== undefined) updateData.city_name = city_name;
    if (state_code !== undefined) updateData.state_code = state_code;
    if (min_wage !== undefined) updateData.min_wage = min_wage;
    if (tip_credit !== undefined) updateData.tip_credit = tip_credit;
    if (market_tier !== undefined) updateData.market_tier = market_tier;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: preset, error } = await supabase
      .from("proforma_city_wage_presets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating city preset:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ preset });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove city wage preset
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // P0: Check if row is global before allowing delete
    const { data: existing, error: fetchError } = await supabase
      .from("proforma_city_wage_presets")
      .select("tenant_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching city preset:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (existing.tenant_id === null) {
      return NextResponse.json({
        error: "Cannot delete global city wage presets. They are system-wide defaults.",
        code: "GLOBAL_IMMUTABLE",
        remediation: "Contact superadmin to manage global city wage presets."
      }, { status: 403 });
    }

    const { error } = await supabase
      .from("proforma_city_wage_presets")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting city preset:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
