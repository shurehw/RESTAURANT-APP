import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET - Fetch proforma settings for the org
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org
    const { data: orgUser } = await supabase
      .from("organization_users")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!orgUser) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get or create settings using the function
    const { data: settings, error } = await supabase
      .rpc("get_proforma_settings", { p_org_id: orgUser.organization_id })
      .single();

    if (error) throw error;

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching proforma settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// POST/PUT - Update proforma settings
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

    const { org_id, ...settings } = body;

    // Upsert settings
    const { error } = await supabase
      .from("proforma_settings")
      .upsert({
        org_id,
        ...settings,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving proforma settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
