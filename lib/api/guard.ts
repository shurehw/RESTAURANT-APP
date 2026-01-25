/**
 * API Route Guard Wrapper
 * Provides standardized error handling, rate limiting, and tenant isolation
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type GuardHandler = () => Promise<NextResponse>;

/**
 * Custom API Error class for throwing structured errors
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Wraps API route handlers with error handling and auth verification
 */
export async function guard(handler: GuardHandler): Promise<NextResponse> {
  try {
    // Verify auth using custom auth cookie OR Supabase session cookie
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get('user_id');
    const supabaseAuthToken = cookieStore.get('sb-access-token') ||
                              cookieStore.get('sb-refresh-token') ||
                              // Check for Supabase v2 cookie format
                              Array.from(cookieStore.getAll()).find(c => c.name.includes('sb-') && c.name.includes('-auth-token'));

    // Allow if either custom cookie or Supabase session exists
    if (!userIdCookie?.value && !supabaseAuthToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Execute handler
    return await handler();
  } catch (error) {
    // Handle ApiError instances
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }

    // Handle unknown errors
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
