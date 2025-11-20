import { NextResponse } from 'next/server';

/**
 * Wraps API route handlers with standardized error handling
 * Converts thrown errors into proper HTTP responses
 */
export async function guard(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (e: any) {
    // Log the full error for debugging (server-side only)
    console.error('[API Error]', {
      message: e?.message,
      code: e?.code,
      status: e?.status,
      details: e?.details,
      hint: e?.hint,
      fullError: JSON.stringify(e, null, 2),
    });

    const status = Number(e?.status) || 500;
    const payload = {
      error: e?.code || e?.name || 'ERROR',
      message: e?.message || 'Internal error',
      details: e?.details ?? undefined,
      hint: e?.hint ?? undefined,
    };
    return NextResponse.json(payload, { status });
  }
}
