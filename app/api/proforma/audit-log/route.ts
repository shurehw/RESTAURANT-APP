import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch audit log for settings changes
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table_name") || "proforma_settings";
    const recordId = searchParams.get("record_id");
    const limit = parseInt(searchParams.get("limit") || "50");

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build query
    let query = supabase
      .from("settings_audit_log")
      .select("*")
      .eq("table_name", tableName)
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (recordId) {
      query = query.eq("record_id", recordId);
    }

    const { data: auditLog, error } = await query;

    if (error) {
      console.error("Error fetching audit log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ audit_log: auditLog || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
