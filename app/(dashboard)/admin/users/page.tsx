export const dynamic = 'force-dynamic';

import { createAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getUserOrgAndVenues } from "@/lib/tenant";
import { AddUserForm } from "@/components/admin/AddUserForm";
import { UserRoleManager } from "@/components/admin/UserRoleManager";
import type { UserRole } from "@/lib/nav/role-permissions";

export default async function AdminUsersPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  // Use admin client — auth already validated by requireUser
  const supabase = createAdminClient();

  // Get all organizations
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name");

  // Get all users in this organization with their roles from user_profiles
  const { data: orgUsers } = await supabase
    .from("organization_users")
    .select(`
      user_id,
      users!inner (
        id,
        email,
        user_profiles!inner (
          full_name,
          role
        )
      )
    `)
    .eq("organization_id", orgId)
    .eq("is_active", true);

  // Transform to flat structure
  const users = (orgUsers || []).map((item: any) => ({
    id: item.users.id,
    email: item.users.email,
    full_name: item.users.user_profiles.full_name,
    role: item.users.user_profiles.role as UserRole,
  }));

  return (
    <div>
      <h1 className="page-header">Team Management</h1>
      <p className="text-muted-foreground mb-8">
        Manage team members and assign roles with appropriate access levels
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Add User Form */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            Add Team Member
          </h2>
          <AddUserForm organizations={organizations || []} />
        </div>

        {/* Users List with Role Management */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            Team Members ({users.length})
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Click on a role badge to edit user permissions
          </p>
          {users.length > 0 ? (
            <UserRoleManager users={users} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No team members yet. Add your first member to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
