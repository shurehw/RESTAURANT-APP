import { createAdminClient, createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export type AuthedUser = {
  id: string;
  email?: string;
};

/**
 * Extracts and validates the authenticated user from Supabase JWT.
 * Falls back to legacy user_id cookie and resolves to an auth.users ID
 * so downstream org/venue checks continue to work.
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

  const cookieStore = await cookies();
  const legacyUserId = cookieStore.get('user_id')?.value;
  if (!legacyUserId) {
    throw {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    };
  }

  try {
    const admin = createAdminClient();

    // Some environments already write auth.users.id into the cookie.
    const { data: authMembership } = await admin
      .from('organization_users')
      .select('user_id')
      .eq('user_id', legacyUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (authMembership?.user_id) {
      return { id: legacyUserId };
    }

    // Otherwise treat it as legacy public.users.id and resolve through email.
    const { data: legacyUser } = await admin
      .from('users')
      .select('email')
      .eq('id', legacyUserId)
      .maybeSingle();

    if (legacyUser?.email) {
      let authUserId: string | null = null;

      const primary = await admin.rpc('get_auth_user_id_by_email', {
        user_email: legacyUser.email,
      });
      if (!primary.error && primary.data) {
        authUserId = primary.data;
      } else {
        const fallback = await admin.rpc('get_auth_uid_by_email', {
          lookup_email: legacyUser.email,
        });
        if (!fallback.error && fallback.data) {
          authUserId = fallback.data;
        }
      }

      if (authUserId) {
        return { id: authUserId, email: legacyUser.email };
      }
    }
  } catch (e) {
    console.error('[auth] Legacy-to-auth user resolution failed:', e);
  }

  // Keep existing degraded fallback behavior if resolution fails.
  return {
    id: legacyUserId,
    email: undefined,
  };
}
