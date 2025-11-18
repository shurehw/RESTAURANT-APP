"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

interface AddUserFormProps {
  organizations: Array<{ id: string; name: string }>;
}

export function AddUserForm({ organizations }: AddUserFormProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddUser = async () => {
    if (!selectedUser || !selectedOrg) return;

    setIsAdding(true);
    try {
      const response = await fetch(`/api/admin/organizations/${selectedOrg}/add-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUser.id }),
      });

      if (response.ok) {
        alert("User added successfully!");
        setSearchQuery("");
        setSearchResults([]);
        setSelectedUser(null);
        setSelectedOrg("");
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to add user");
      }
    } catch (error) {
      console.error("Error adding user:", error);
      alert("Failed to add user");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Card className="p-6">
      {/* Search for User */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Search User</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching}>
            Search
          </Button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium mb-2">Select User</label>
          {searchResults.map((user) => (
            <div
              key={user.id}
              onClick={() => setSelectedUser(user)}
              className={`p-3 border rounded cursor-pointer hover:bg-muted/50 ${
                selectedUser?.id === user.id ? "border-brass bg-brass/5" : ""
              }`}
            >
              <div className="font-medium">{user.full_name || user.email}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
          ))}
        </div>
      )}

      {/* Select Organization */}
      {selectedUser && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Organization</label>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md"
          >
            <option value="">-- Select Organization --</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Add Button */}
      {selectedUser && selectedOrg && (
        <Button
          onClick={handleAddUser}
          disabled={isAdding}
          variant="brass"
          className="w-full"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add {selectedUser.full_name || selectedUser.email} to Organization
        </Button>
      )}
    </Card>
  );
}
