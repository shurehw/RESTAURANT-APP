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
  isPlatformAdmin: boolean;
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
    const adminClient = createAdminClient();
    
    // Check if user is a platform admin
    const { data: platformAdmin } = await adminClient
      .from('platform_admins')
      .select('id')
      .eq('user_id', authUser.id)
      .eq('is_active', true)
      .single();
    
    const isPlatformAdmin = !!platformAdmin;

    // Use adminClient to bypass RLS - we've already verified identity via getUser()
    const { data: orgMembership } = await adminClient
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
      isPlatformAdmin,
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

  // Get email from custom users table (use admin client to bypass RLS)
  const adminClientForLookup = createAdminClient();
  const { data: customUser } = await adminClientForLookup
    .from('users')
    .select('email')
    .eq('id', customUserId)
    .single();

  if (!customUser?.email) {
    return null; // Invalid custom user
  }

  // Look up auth.users ID by email via database function
  // (auth.admin.listUsers() API is broken on this project)
  const adminClient = createAdminClient();
  const { data: authUid, error: rpcError } = await adminClient
    .rpc('get_auth_uid_by_email', { lookup_email: customUser.email });

  if (rpcError) {
    console.error('[resolveContext] RPC get_auth_uid_by_email error:', rpcError.message);
  }

  const matchingAuthUserId: string | null = authUid || null;

  if (!matchingAuthUserId) {
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
      isPlatformAdmin: false,
    };
  }

  // Check if user is a platform admin
  const { data: platformAdmin } = await adminClient
    .from('platform_admins')
    .select('id')
    .eq('user_id', matchingAuthUserId)
    .eq('is_active', true)
    .single();

  const isPlatformAdmin = !!platformAdmin;

  // Get organization membership using auth user ID
  const { data: orgMembership } = await adminClient
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', matchingAuthUserId)
    .eq('is_active', true)
    .single();

  return {
    authUserId: matchingAuthUserId,
    customUserId,
    email: customUser.email,
    orgId: orgMembership?.organization_id || null,
    role: orgMembership?.role as TenantContext['role'] || null,
    isAuthenticated: true,
    isPlatformAdmin,
  };
}

/**
 * Simplified helper that throws if not authenticated or no org access.
 * Use in pages/routes that require authentication.
 * 
 * Platform admins are allowed through even without org membership
 * (they can see all orgs via RLS bypass).
 */
export async function requireContext(): Promise<TenantContext> {
  const ctx = await resolveContext();
  
  if (!ctx || !ctx.isAuthenticated) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Not authenticated' };
  }
  
  // Platform admins can access without org membership
  if (ctx.isPlatformAdmin) {
    return ctx;
  }
  
  if (!ctx.orgId) {
    throw { status: 403, code: 'NO_ORG', message: 'No organization access' };
  }
  
  return ctx;
}
