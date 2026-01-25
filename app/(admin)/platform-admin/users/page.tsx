'use client';

/**
 * Admin: Users List
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

type User = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  has_custom_user: boolean;
  custom_user_id: string | null;
  organizations: {
    id: string;
    name: string;
    slug: string;
    role: string;
  }[];
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUsers(data.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(u => 
    !filter || 
    u.email?.toLowerCase().includes(filter.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users ({users.length})</h1>
        <input
          type="text"
          placeholder="Filter by email or name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border rounded-md w-64"
        />
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Organizations
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Last Sign In
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{user.email}</div>
                  {user.full_name && (
                    <div className="text-xs text-gray-500">{user.full_name}</div>
                  )}
                  <div className="text-xs text-gray-400 font-mono">{user.id}</div>
                </td>
                <td className="px-6 py-4">
                  {user.organizations.length > 0 ? (
                    <div className="space-y-1">
                      {user.organizations.map((org) => (
                        <Link
                          key={org.id}
                          href={`/platform-admin/organizations/${org.id}`}
                          className="block text-sm text-blue-600 hover:underline"
                        >
                          {org.name}
                          <span className="ml-2 text-xs text-gray-500">({org.role})</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No organization</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs px-2 py-1 rounded-full inline-block w-fit ${
                      user.email_confirmed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {user.email_confirmed ? 'Confirmed' : 'Unconfirmed'}
                    </span>
                    {user.has_custom_user && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 inline-block w-fit">
                        Legacy user
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {user.last_sign_in_at 
                    ? new Date(user.last_sign_in_at).toLocaleDateString()
                    : 'Never'
                  }
                </td>
              </tr>
            ))}
            {!filteredUsers.length && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  {filter ? 'No users match your filter.' : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
