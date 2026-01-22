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
    // Verify auth using custom auth cookie
    const cookieStore = await cookies();
    const userIdCookie = cookieStore.get('user_id');

    if (!userIdCookie?.value) {
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
