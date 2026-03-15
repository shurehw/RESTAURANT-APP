import { NextResponse } from 'next/server';

/**
 * Wraps API route handlers with standardized error handling
 * Converts thrown errors into proper HTTP responses
 */

function isClientAbortLike(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === 'ECONNRESET' ||
    message === 'aborted' ||
    message.includes('unexpected end of json input')
  );
}

export async function guard(
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (e: any) {
    if (!isClientAbortLike(e)) {
      // Log the full error for debugging (server-side only)
      console.error('[API Error]', {
        message: e?.message,
        code: e?.code,
        status: e?.status,
        details: e?.details,
        hint: e?.hint,
        fullError: JSON.stringify(e, null, 2),
      });
    }

    const status = Number(e?.status) || (isClientAbortLike(e) ? 499 : 500);
    // e.code can be a numeric process exit code (e.g. 1) — use name/string codes only
    const errorCode = (typeof e?.code === 'string' ? e.code : null) || e?.name || 'ERROR';
    const payload = {
      error: errorCode,
      message: e?.message || 'Internal error',
      details: e?.details ?? undefined,
      hint: e?.hint ?? undefined,
    };
    return NextResponse.json(payload, { status });
  }
}
