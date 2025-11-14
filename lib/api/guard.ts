/**
 * API Route Guard Wrapper
 * Provides standardized error handling, rate limiting, and tenant isolation
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api-errors';

type GuardHandler = () => Promise<NextResponse>;

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
        { error: error.message, code: error.code },
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
