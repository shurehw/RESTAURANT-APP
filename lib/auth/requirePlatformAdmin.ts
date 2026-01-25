/**
 * lib/auth/requirePlatformAdmin.ts
 * Gate for platform admin routes - only super admins can access
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';

export type PlatformAdminContext = {
  userId: string;
  email: string;
  grantedAt: string;
};

/**
 * Verifies the current user is a platform admin.
 * Returns admin context if valid, throws if not.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();
  
  // Get current authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Not authenticated' };
  }

  // Check if user is a platform admin (use admin client to bypass RLS chicken-egg)
  const adminClient = createAdminClient();
  const { data: platformAdmin, error: adminError } = await adminClient
    .from('platform_admins')
    .select('user_id, email, granted_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (adminError || !platformAdmin) {
    // Also check by email as fallback (for placeholder records)
    const { data: adminByEmail } = await adminClient
      .from('platform_admins')
      .select('id, user_id, email, granted_at')
      .eq('email', user.email?.toLowerCase())
      .eq('is_active', true)
      .single();

    if (adminByEmail) {
      // Update the placeholder user_id if it was a placeholder
      if (adminByEmail.user_id === '00000000-0000-0000-0000-000000000000') {
        await adminClient
          .from('platform_admins')
          .update({ user_id: user.id })
          .eq('id', adminByEmail.id);
      }

      return {
        userId: user.id,
        email: adminByEmail.email,
        grantedAt: adminByEmail.granted_at,
      };
    }

    throw { status: 403, code: 'NOT_PLATFORM_ADMIN', message: 'Access denied. Platform admin required.' };
  }

  return {
    userId: platformAdmin.user_id,
    email: platformAdmin.email,
    grantedAt: platformAdmin.granted_at,
  };
}

/**
 * Non-throwing version - returns null if not admin
 */
export async function getPlatformAdminContext(): Promise<PlatformAdminContext | null> {
  try {
    return await requirePlatformAdmin();
  } catch {
    return null;
  }
}
