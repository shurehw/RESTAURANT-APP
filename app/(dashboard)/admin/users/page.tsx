import { createClient } from "@/lib/supabase/server";
import { AddUserForm } from "@/components/admin/AddUserForm";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  // Get all organizations
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name");

  // Get all users with their org memberships
  const { data: users } = await supabase
    .from("users")
    .select(`
      id,
      email,
      full_name,
      organization_users (
        organization_id,
        role,
        organizations (
          name
        )
      )
    `)
    .order("email");

  return (
    <div>
      <h1 className="page-header">User Management</h1>
      <p className="text-muted-foreground mb-8">
        Manage user access to organizations
      </p>

      <div className="grid grid-cols-2 gap-8">
        {/* Add User Form */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Add User to Organization</h2>
          <AddUserForm organizations={organizations || []} />
        </div>

        {/* Users List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">All Users</h2>
          <div className="space-y-2">
            {users?.map((user) => (
              <div key={user.id} className="p-3 border rounded-lg">
                <div className="font-medium">{user.full_name || user.email}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Organizations: {user.organization_users?.map((ou: any) => ou.organizations?.name).join(", ") || "None"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
