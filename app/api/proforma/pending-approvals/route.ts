import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch pending approval requests
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organization_id");

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
      .from("pending_approvals_dashboard")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data: pendingChanges, error } = await query;

    if (error) {
      console.error("Error fetching pending approvals:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pending_changes: pendingChanges || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Submit a settings change for approval
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

    const {
      organization_id,
      table_name,
      record_id,
      proposed_changes,
      change_description,
    } = body;

    if (!organization_id || !table_name || !record_id || !proposed_changes) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: changeId, error } = await supabase.rpc(
      "submit_settings_change_for_approval",
      {
        p_organization_id: organization_id,
        p_table_name: table_name,
        p_record_id: record_id,
        p_proposed_changes: proposed_changes,
        p_change_description: change_description || null,
      }
    );

    if (error) {
      console.error("Error submitting change for approval:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ change_id: changeId });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
