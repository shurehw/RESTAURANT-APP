import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST: Approve or reject a pending settings change
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

    const { change_id, approve, review_notes } = body;

    if (!change_id || approve === undefined) {
      return NextResponse.json(
        { error: "Missing change_id or approve flag" },
        { status: 400 }
      );
    }

    const { error } = await supabase.rpc("review_settings_change", {
      p_change_id: change_id,
      p_approve: approve,
      p_review_notes: review_notes || null,
    });

    if (error) {
      console.error("Error reviewing change:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: approve ? "approved" : "rejected",
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
