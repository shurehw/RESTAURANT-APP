/**
 * Admin: Organization Detail
 */

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function OrganizationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adminClient = createAdminClient();
  
  const { data: org, error } = await adminClient
    .from('organizations')
    .select(`
      *,
      organization_users (
        id,
        user_id,
        role,
        is_active,
        created_at
      ),
      organization_settings (
        settings
      )
    `)
    .eq('id', id)
    .single();

  if (error || !org) {
    notFound();
  }

  // Get member emails from auth.users
  const { data: authUsers } = await adminClient.auth.admin.listUsers();
  
  const members = org.organization_users?.map((member: {
    id: string;
    user_id: string;
    role: string;
    is_active: boolean;
    created_at: string;
  }) => {
    const authUser = authUsers?.users?.find(u => u.id === member.user_id);
    return {
      ...member,
      email: authUser?.email || 'Unknown',
      full_name: authUser?.user_metadata?.full_name || null,
    };
  }) || [];

  // Get org stats
  const { count: invoiceCount } = await adminClient
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id);

  const { count: vendorCount } = await adminClient
    .from('vendors')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id);

  const { count: venueCount } = await adminClient
    .from('venues')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id);

  return (
    <div>
      <div className="mb-6">
        <Link href="/platform-admin/organizations" className="text-blue-600 hover:underline text-sm">
          ← Back to Organizations
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
          <p className="text-gray-500">
            <code className="bg-gray-100 px-2 py-1 rounded">{org.slug}</code>
          </p>
        </div>
        <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
          org.is_active 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {org.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Members</p>
          <p className="text-2xl font-semibold">{members.filter((m: { is_active: boolean }) => m.is_active).length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Venues</p>
          <p className="text-2xl font-semibold">{venueCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Vendors</p>
          <p className="text-2xl font-semibold">{vendorCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Invoices</p>
          <p className="text-2xl font-semibold">{invoiceCount || 0}</p>
        </div>
      </div>

      {/* Members */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          <Link
            href={`/platform-admin/organizations/${id}/members`}
            className="text-sm text-blue-600 hover:underline"
          >
            Manage Members →
          </Link>
        </div>
        <div className="divide-y">
          {members.filter((m: { is_active: boolean }) => m.is_active).map((member: {
            id: string;
            email: string;
            full_name: string | null;
            role: string;
          }) => (
            <div key={member.id} className="px-6 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{member.email}</p>
                {member.full_name && (
                  <p className="text-xs text-gray-500">{member.full_name}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                member.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                member.role === 'manager' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {member.role}
              </span>
            </div>
          ))}
          {!members.filter((m: { is_active: boolean }) => m.is_active).length && (
            <div className="px-6 py-8 text-center text-gray-500">
              No members yet.
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Organization ID</dt>
            <dd className="font-mono text-xs">{org.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd>{new Date(org.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
