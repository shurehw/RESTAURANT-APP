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
    const status = Number(e?.status) || 500;
    const payload = {
      error: e?.code || 'ERROR',
      message: e?.message || 'Internal error',
      details: e?.details ?? undefined,
    };
    return NextResponse.json(payload, { status });
  }
}
