import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    // Create scenario
    const { data: scenario, error } = await supabase
      .from("proforma_scenarios")
      .insert({
        project_id: body.project_id,
        name: body.name,
        is_base: body.is_base,
        months: body.months,
        start_month: body.start_month,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating scenario:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scenario });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
