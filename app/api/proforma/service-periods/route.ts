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

    const { data: services, error } = await supabase
      .from("proforma_revenue_service_periods")
      .select("*")
      .eq("scenario_id", scenario_id)
      .order("sort_order");

    if (error) {
      console.error("Error loading service periods:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ services });
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
      service_name,
      days_per_week,
      avg_covers_per_service,
      avg_food_check,
      avg_bev_check,
      sort_order,
    } = body;

    const { data, error } = await supabase
      .from("proforma_revenue_service_periods")
      .insert({
        scenario_id,
        service_name,
        days_per_week,
        avg_covers_per_service,
        avg_food_check,
        avg_bev_check,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating service period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ service: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      id,
      service_name,
      days_per_week,
      avg_covers_per_service,
      avg_food_check,
      avg_bev_check,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("proforma_revenue_service_periods")
      .update({
        service_name,
        days_per_week,
        avg_covers_per_service,
        avg_food_check,
        avg_bev_check,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating service period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ service: data });
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
      .from("proforma_revenue_service_periods")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting service period:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
