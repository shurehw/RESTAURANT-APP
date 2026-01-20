import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch validation rules
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric");
    const conceptType = searchParams.get("concept_type");

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

    let query = supabase
      .from("proforma_validation_rules")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .eq("is_active", true);

    if (metric) {
      query = query.eq("metric", metric);
    }

    if (conceptType) {
      query = query.or(`concept_type.eq.${conceptType},concept_type.is.null`);
    }

    const { data: rules, error } = await query.order("severity", {
      ascending: false,
    });

    if (error) {
      console.error("Error fetching validation rules:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create new validation rule (admin only)
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
      metric,
      concept_type,
      market_tier,
      operator_tier,
      min_value,
      max_value,
      severity = "warning",
      message_template,
    } = body;

    if (!metric || !message_template) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: rule, error } = await supabase
      .from("proforma_validation_rules")
      .insert({
        tenant_id: profile.tenant_id,
        metric,
        concept_type,
        market_tier,
        operator_tier,
        min_value,
        max_value,
        severity,
        message_template,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating validation rule:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Update validation rule
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

    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // P0: Check if row is global (tenant_id IS NULL) before allowing update
    const { data: existing, error: fetchError } = await supabase
      .from("proforma_validation_rules")
      .select("tenant_id, metric, severity")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching validation rule:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // P0: GLOBAL IMMUTABILITY CHECK
    if (existing.tenant_id === null) {
      return NextResponse.json({
        error: "Cannot modify global validation rules. Create tenant-specific override instead.",
        code: "GLOBAL_IMMUTABLE",
        remediation: `Create a new validation rule for your organization with metric='${existing.metric}' and severity='${existing.severity}' instead of modifying the global default.`,
        action: "create_tenant_override"
      }, { status: 403 });
    }

    const { data: rule, error } = await supabase
      .from("proforma_validation_rules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating validation rule:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Soft delete (set is_active = false)
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
      .from("proforma_validation_rules")
      .select("tenant_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching validation rule:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (existing.tenant_id === null) {
      return NextResponse.json({
        error: "Cannot delete global validation rules. They are system-wide defaults.",
        code: "GLOBAL_IMMUTABLE",
        remediation: "Contact superadmin to manage global validation rules."
      }, { status: 403 });
    }

    const { error } = await supabase
      .from("proforma_validation_rules")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      console.error("Error deleting validation rule:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
