/**
 * GET/POST/DELETE /api/research/bookmarks
 *
 * CRUD for saved search bookmarks.
 * Authenticated via user session, scoped to org.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: bookmarks, error } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("organization_id", ctx.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching bookmarks:", error);
      return NextResponse.json(
        { error: "Failed to fetch bookmarks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, bookmarks });
  } catch (error) {
    console.error("Error in bookmarks GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, url, snippet, source, image_url, notes } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: bookmark, error } = await supabase
      .from("saved_searches")
      .insert({
        organization_id: ctx.orgId,
        user_id: ctx.authUserId,
        title: title.trim(),
        url: url || null,
        snippet: snippet || null,
        source: source || "serper",
        image_url: image_url || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating bookmark:", error);
      return NextResponse.json(
        { error: "Failed to save bookmark" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, bookmark });
  } catch (error) {
    console.error("Error in bookmarks POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Bookmark ID is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Only allow deleting own bookmarks within org
    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.authUserId)
      .eq("organization_id", ctx.orgId);

    if (error) {
      console.error("Error deleting bookmark:", error);
      return NextResponse.json(
        { error: "Failed to delete bookmark" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in bookmarks DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
