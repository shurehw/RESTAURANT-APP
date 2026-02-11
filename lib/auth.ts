import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export type AuthedUser = {
  id: string;
  email?: string;
};

/**
 * Extracts and validates the authenticated user from Supabase JWT.
 * Falls back to legacy user_id cookie for backward compatibility.
 * Throws 401 if no valid session.
 */
export async function requireUser(): Promise<AuthedUser> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user) {
    return {
      id: user.id,
      email: user.email,
    };
  }

  // Fallback: legacy user_id cookie (used by other routes in the codebase)
  const cookieStore = await cookies();
  const legacyUserId = cookieStore.get('user_id')?.value;
  if (legacyUserId) {
    return {
      id: legacyUserId,
      email: undefined,
    };
  }

  throw {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
  };
}
