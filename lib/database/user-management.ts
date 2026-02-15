/**
 * User Management Data Access
 * Functions for managing users and roles
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/nav/role-permissions';

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  organization_users?: Array<{
    organization_id: string;
    organizations?: {
      name: string;
    };
  }>;
}

/**
 * Get all users for an organization
 */
export async function getOrganizationUsers(orgId: string): Promise<UserWithRole[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('organization_users')
    .select(`
      user_id,
      users!inner (
        id,
        email,
        user_profiles!inner (
          full_name,
          role,
          is_active,
          created_at
        )
      )
    `)
    .eq('organization_id', orgId)
    .eq('is_active', true);

  if (error) throw error;

  // Transform the nested structure
  return (data || []).map((item: any) => ({
    id: item.users.id,
    email: item.users.email,
    full_name: item.users.user_profiles.full_name,
    role: item.users.user_profiles.role as UserRole,
    is_active: item.users.user_profiles.is_active,
    created_at: item.users.user_profiles.created_at,
  }));
}

/**
 * Update user role
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('user_profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Get user profile with role
 */
export async function getUserProfile(userId: string): Promise<UserWithRole | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('users')
    .select(`
      id,
      email,
      user_profiles!inner (
        full_name,
        role,
        is_active,
        created_at
      )
    `)
    .eq('id', userId)
    .single();

  if (error) return null;

  return {
    id: data.id,
    email: data.email,
    full_name: (data as any).user_profiles.full_name,
    role: (data as any).user_profiles.role as UserRole,
    is_active: (data as any).user_profiles.is_active,
    created_at: (data as any).user_profiles.created_at,
  };
}

// Re-export role constants from client-safe module
export { ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/lib/nav/role-permissions';
