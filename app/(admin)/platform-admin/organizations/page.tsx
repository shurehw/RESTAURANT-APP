/**
 * Admin: Organizations List
 */

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdminOrganizations() {
  const adminClient = createAdminClient();
  
  const { data: organizations } = await adminClient
    .from('organizations')
    .select(`
      id,
      name,
      slug,
      is_active,
      created_at,
      organization_users (
        id,
        role,
        is_active
      )
    `)
    .order('name');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
        <Link
          href="/platform-admin/organizations/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Create Organization
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Organization
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {organizations?.map((org) => {
              const activeMembers = org.organization_users?.filter(
                (m: { is_active: boolean }) => m.is_active
              ).length || 0;
              
              return (
                <tr key={org.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{org.name}</div>
                    <div className="text-xs text-gray-500">{org.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                      {org.slug}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {activeMembers} active
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      org.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {org.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link
                      href={`/platform-admin/organizations/${org.id}`}
                      className="text-blue-600 hover:text-blue-800 mr-4"
                    >
                      View
                    </Link>
                    <Link
                      href={`/platform-admin/organizations/${org.id}/members`}
                      className="text-purple-600 hover:text-purple-800"
                    >
                      Members
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!organizations?.length && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No organizations yet.{' '}
                  <Link href="/platform-admin/organizations/new" className="text-blue-600 hover:underline">
                    Create one
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
