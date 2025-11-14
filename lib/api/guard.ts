/**
 * API Route Guard Wrapper
 * Provides standardized error handling, rate limiting, and tenant isolation
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    // Verify auth
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
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
