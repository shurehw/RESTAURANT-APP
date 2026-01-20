import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch version history for settings
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("org_id");
    const asOf = searchParams.get("as_of"); // Optional: get settings as of specific date

    if (!orgId) {
      return NextResponse.json({ error: "Missing org_id" }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If as_of is provided, use time-travel function
    if (asOf) {
      const { data, error } = await supabase.rpc("get_proforma_settings_at", {
        p_org_id: orgId,
        p_as_of: asOf,
      });

      if (error) {
        console.error("Error fetching settings at date:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ settings: data?.[0] || null, as_of: asOf });
    }

    // Otherwise, fetch all versions for this org (version history timeline)
    const { data: versions, error } = await supabase
      .from("proforma_settings")
      .select("*")
      .eq("org_id", orgId)
      .order("version", { ascending: false });

    if (error) {
      console.error("Error fetching settings history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ versions: versions || [] });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
