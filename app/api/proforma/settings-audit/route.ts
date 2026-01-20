import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch audit log
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table_name");
    const recordId = searchParams.get("record_id");
    const userId = searchParams.get("user_id");
    const limit = parseInt(searchParams.get("limit") || "100");

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
      .from("settings_audit_log")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (tableName) {
      query = query.eq("table_name", tableName);
    }

    if (recordId) {
      query = query.eq("record_id", recordId);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("Error fetching audit log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
