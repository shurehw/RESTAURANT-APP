/**
 * POST /api/research/search
 *
 * Proxy to Serper API for web search results.
 * Authenticated via user session.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@/lib/auth/resolveContext";

const SERPER_API_KEY = process.env.SERPER_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated || !ctx.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!SERPER_API_KEY) {
      return NextResponse.json(
        { error: "Serper API key not configured" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { query, type = "search", num = 10 } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const serperResponse = await fetch("https://google.serper.dev/" + type, {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query.trim(),
        num,
      }),
    });

    if (!serperResponse.ok) {
      console.error("Serper API error:", serperResponse.status);
      return NextResponse.json(
        { error: "Search service unavailable" },
        { status: 502 }
      );
    }

    const data = await serperResponse.json();

    return NextResponse.json({ success: true, results: data });
  } catch (error) {
    console.error("Error in research search:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
