import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scenario_id = searchParams.get("scenario_id");

    if (!scenario_id) {
      return NextResponse.json({ error: "scenario_id required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: pdrs, error } = await supabase
      .from("proforma_revenue_pdr")
      .select("*")
      .eq("scenario_id", scenario_id);

    if (error) {
      console.error("Error loading PDRs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pdrs });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      scenario_id,
      room_name,
      capacity,
      events_per_month,
      avg_spend_per_person,
      avg_party_size,
      ramp_months,
      food_pct,
      bev_pct,
      other_pct,
    } = body;

    const { data, error } = await supabase
      .from("proforma_revenue_pdr")
      .insert({
        scenario_id,
        room_name,
        capacity,
        events_per_month,
        avg_spend_per_person,
        avg_party_size,
        ramp_months: ramp_months ?? 12,
        food_pct,
        bev_pct,
        other_pct,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating PDR:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pdr: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("proforma_revenue_pdr")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting PDR:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
