import { createClient } from '@/lib/supabase/server';

export type AuthedUser = {
  id: string;
  email?: string;
};

/**
 * Extracts and validates the authenticated user from Supabase JWT
 * Throws 401 if no valid session
 */
export async function requireUser(): Promise<AuthedUser> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    };
  }

  return {
    id: user.id,
    email: user.email,
  };
}
