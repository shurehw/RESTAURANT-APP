import { createClient, createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export type AuthedUser = {
  id: string;
  email?: string;
};

/**
 * Extracts and validates the authenticated user from Supabase JWT.
 * Falls back to legacy user_id cookie — resolves to Supabase auth user
 * so downstream org/venue checks work correctly.
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
    // The legacy cookie stores a public.users ID which differs from auth.users ID.
    // organization_users references auth.users IDs, so resolve via email match.
    try {
      const admin = createAdminClient();
      const { data: legacyUser } = await admin
        .from('users')
        .select('email')
        .eq('id', legacyUserId)
        .single();

      if (legacyUser?.email) {
        const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 100 });
        const authUser = authUsers?.find((u: { email?: string }) => u.email === legacyUser.email);
        if (authUser) {
          return { id: authUser.id, email: authUser.email ?? undefined };
        }
      }
    } catch (e) {
      console.error('[auth] Legacy-to-auth user resolution failed:', e);
    }

    // Ultimate fallback: return legacy ID directly
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
