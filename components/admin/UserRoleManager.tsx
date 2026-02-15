"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Save, X } from "lucide-react";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/nav/role-permissions";
import type { UserRole } from "@/lib/nav/role-permissions";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  organization_users?: Array<{
    organizations?: {
      name: string;
    };
  }>;
}

interface UserRoleManagerProps {
  users: User[];
}

export function UserRoleManager({ users }: UserRoleManagerProps) {
  const router = useRouter();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<UserRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditingRole(user.role);
  };

  const handleCancel = () => {
    setEditingUserId(null);
    setEditingRole(null);
  };

  const handleSave = async (userId: string) => {
    if (!editingRole) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editingRole }),
      });

      if (response.ok) {
        alert("Role updated successfully!");
        setEditingUserId(null);
        setEditingRole(null);
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update role");
      }
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role");
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'owner':
      case 'director':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'gm':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'agm':
      case 'manager':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'exec_chef':
      case 'sous_chef':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-3">
      {users.map((user) => {
        const isEditing = editingUserId === user.id;

        return (
          <Card key={user.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {user.full_name || user.email}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {user.email}
                </div>
                {user.organization_users && user.organization_users.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {user.organization_users.map((ou) => ou.organizations?.name).join(", ")}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <select
                      value={editingRole || user.role}
                      onChange={(e) => setEditingRole(e.target.value as UserRole)}
                      className="px-2 py-1 text-sm border border-input rounded-md"
                      disabled={isSaving}
                    >
                      {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSave(user.id)}
                      disabled={isSaving}
                      title="Save"
                    >
                      <Save className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      disabled={isSaving}
                      title="Cancel"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge
                      variant="outline"
                      className={`${getRoleBadgeColor(user.role)} cursor-pointer hover:opacity-80`}
                      onClick={() => handleEdit(user)}
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </>
                )}
              </div>
            </div>

            {isEditing && editingRole && (
              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                {ROLE_DESCRIPTIONS[editingRole]}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
