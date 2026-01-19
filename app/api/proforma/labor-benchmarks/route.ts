import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const concept = searchParams.get("concept");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!concept) {
      return NextResponse.json({ error: "Concept type required" }, { status: 400 });
    }

    // Get benchmarks for this concept
    const { data, error } = await supabase.rpc("get_labor_benchmarks", {
      concept,
    });

    if (error) {
      console.error("Error fetching labor benchmarks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Data comes back as array with single row
    const benchmarks = data?.[0] || null;

    return NextResponse.json({ benchmarks });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
