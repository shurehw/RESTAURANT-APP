import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const scenario_id = searchParams.get("scenario_id");

    if (!scenario_id) {
      return NextResponse.json(
        { error: "scenario_id required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("proforma_labor_salaried_roles")
      .select("*")
      .eq("scenario_id", scenario_id)
      .order("start_month");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ roles: data });
  } catch (error: any) {
    console.error("Error fetching salaried roles:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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

    const { data, error } = await supabase
      .from("proforma_labor_salaried_roles")
      .insert({
        scenario_id: body.scenario_id,
        role_name: body.role_name,
        annual_salary: body.annual_salary,
        start_month: body.start_month || 1,
        end_month: body.end_month || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating salaried role:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ role: data });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const role_id = searchParams.get("id");

    if (!role_id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("proforma_labor_salaried_roles")
      .delete()
      .eq("id", role_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting salaried role:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
