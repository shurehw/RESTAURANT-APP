/**
 * lib/auth/resolveContext.ts
 * Centralized tenant context resolver
 * 
 * This is the ONLY place that resolves user → organization.
 * All pages/API routes should use this helper.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export type TenantContext = {
  authUserId: string;
  customUserId: string | null;
  email: string;
  orgId: string | null;
  role: 'owner' | 'admin' | 'manager' | 'viewer' | null;
  isAuthenticated: boolean;
};

/**
 * Resolves the current user's tenant context.
 * 
 * Priority:
 * 1. Supabase Auth session (canonical, preferred)
 * 2. Legacy user_id cookie → email → auth.users lookup (migration path)
 * 
 * Returns null if not authenticated.
 */
export async function resolveContext(): Promise<TenantContext | null> {
  const supabase = await createClient();
  
  // ========================================================================
  // Try Supabase Auth session first (canonical path)
  // ========================================================================
  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (authUser) {
    // User has valid Supabase session - this is the clean path
    const { data: orgMembership } = await supabase
      .from('organization_users')
      .select('organization_id, role')
      .eq('user_id', authUser.id)
      .eq('is_active', true)
      .single();

    return {
      authUserId: authUser.id,
      customUserId: null, // Not needed when using Supabase Auth
      email: authUser.email || '',
      orgId: orgMembership?.organization_id || null,
      role: orgMembership?.role as TenantContext['role'] || null,
      isAuthenticated: true,
    };
  }

  // ========================================================================
  // Fallback: Legacy user_id cookie (migration path)
  // ========================================================================
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get('user_id');
  
  if (!userIdCookie?.value) {
    return null; // Not authenticated
  }

  const customUserId = userIdCookie.value;

  // Get email from custom users table
  const { data: customUser } = await supabase
    .from('users')
    .select('email')
    .eq('id', customUserId)
    .single();

  if (!customUser?.email) {
    return null; // Invalid custom user
  }

  // Look up auth.users ID by email (via admin client, since we need cross-table lookup)
  const adminClient = createAdminClient();
  const { data: authUsers } = await adminClient.auth.admin.listUsers();
  const matchingAuthUser = authUsers?.users?.find(
    u => u.email?.toLowerCase() === customUser.email.toLowerCase()
  );

  if (!matchingAuthUser) {
    // User exists in custom table but not in auth.users
    // This shouldn't happen after login sync, but handle gracefully
    console.warn(`[resolveContext] No auth.users entry for ${customUser.email}`);
    return {
      authUserId: '', // Empty - user needs to re-login
      customUserId,
      email: customUser.email,
      orgId: null,
      role: null,
      isAuthenticated: false, // Degraded state
    };
  }

  // Get organization membership using auth user ID
  const { data: orgMembership } = await adminClient
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', matchingAuthUser.id)
    .eq('is_active', true)
    .single();

  return {
    authUserId: matchingAuthUser.id,
    customUserId,
    email: customUser.email,
    orgId: orgMembership?.organization_id || null,
    role: orgMembership?.role as TenantContext['role'] || null,
    isAuthenticated: true,
  };
}

/**
 * Simplified helper that throws if not authenticated or no org access.
 * Use in pages/routes that require authentication.
 */
export async function requireContext(): Promise<TenantContext> {
  const ctx = await resolveContext();
  
  if (!ctx || !ctx.isAuthenticated) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Not authenticated' };
  }
  
  if (!ctx.orgId) {
    throw { status: 403, code: 'NO_ORG', message: 'No organization access' };
  }
  
  return ctx;
}
